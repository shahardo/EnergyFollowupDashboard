import { Checkbox, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef } from 'react';
import { DEMAND_PRESETS, demandPresets } from '../../data/baseline';
import { he } from '../../i18n/he';
import { demandCsv } from '../../io/csvExport';
import { hasNonElectric } from '../../model/carriers';
import { sectorTotalEnergy } from '../../model/demand';
import { fromPct, toPct, toTWh } from '../../model/units';
import { centeredRange } from '../../model/sliderRange';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useNonElectric } from '../../store/usePlanSeries';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { fmt } from '../../utils/format';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { colorFor, demandPresetColors, sectorColors } from '../charts/palette';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { SectorDetails } from '../controls/SectorDetails';
import { MeasuresPanel } from './MeasuresPanel';
import { ScenarioSelect } from './ScenarioSelect';
import { ViewSelect } from './ViewSelect';
import { useDemandChart, type FuelScope } from './demandSeries';
import { modeNote, unitInfo } from './unitSeries';

/** Options for the demand chart's view selector: by sector, or by energy source (carriers). */
const DEMAND_VIEW_OPTIONS = [
  { value: 'sectors' as const, label: he.viewBy.sector },
  { value: 'carriers' as const, label: he.viewBy.energySource },
];

/** Signed difference (+ / − / none), no decimal digits. */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 0)}`;

/**
 * The demand column in the plan page: the demand chart by sector or energy source (with the reduction band and
 * net-demand line, the view selector in the title), the scenario picker, and the parameter panel: a growth slider
 * per sector (plus a second slider for its fuels/gas, when it has non-electric demand) and efficiency/saving.
 * Shared by the plan tab and the scenario-planning tab (identical in both).
 */
export function DemandColumn() {
  const scenario = useDemandStore((s) => s.scenario);
  const updateSector = useDemandStore((s) => s.updateSector);
  const active = useDemandStore((s) => s.active);
  const select = useDemandStore((s) => s.select);
  const targetYear = useUiStore((s) => s.targetYear);
  const selectedUnits = useUiStore((s) => s.units);
  const detail = useUiStore((s) => s.detail);
  const view = useUiStore((s) => s.planView);
  const setView = useUiStore((s) => s.setPlanView);
  const transportExpanded = useUiStore((s) => s.transportExpanded);
  const setTransportExpanded = useUiStore((s) => s.setTransportExpanded);
  const hasSubSectors = scenario.sectors.some((s) => s.subSectors?.length);
  const { years, demandPoints, measured } = useSeries();
  const nePoints = useNonElectric();
  const compareScenario = useCompareStore((s) => s.demand);
  const chartRef = useRef<ChartHandle>(null);
  const gear = useSingleGear();
  const t = he.plan;
  const presetBase = demandPresets[active];
  // In BCM and tCO₂eq modes the demand is shown as primary energy (toe).
  const units = selectedUnits === 'bcm' || selectedUnits === 'co2' ? 'toe' : selectedUnits;
  const { unit, digits } = unitInfo(units);
  const { baseYear, horizonYear } = scenario;
  // TWh/GW ("חשמל") show electricity only; fuels and direct gas (combined as final energy) go in only in toe mode.
  const fuels: FuelScope = units === 'toe' ? 'all' : 'none';

  // ── Chart series (shared by both tabs) ──────────────────────────────────────
  const { stacked, reduction, line: netLine, compare, withFuels } = useDemandChart({ units, view, fuels });

  // ── Sliders: each sector's TWh at the horizon year, vs. the TWh at the base growth rate ──────
  const horizonTWh = useMemo(
    () => new Map(demandPoints.filter((p) => p.year === horizonYear).map((p) => [p.sector, toTWh(p.energy)])),
    [demandPoints, horizonYear],
  );
  const horizonNeTWh = useMemo(
    () => new Map(nePoints.filter((p) => p.year === horizonYear).map((p) => [p.sector, toTWh(p.fuels + p.gas)])),
    [nePoints, horizonYear],
  );
  const note = [modeNote(units, 'demand'), withFuels ? t.fuelsNote : ''].filter(Boolean).join(' ');

  return (
    <Stack gap="sm">
      <ChartCard
        title={he.viewBy.demandLabel}
        titleControls={
          <ViewSelect ariaLabel={he.viewBy.demandAriaLabel} value={view} options={DEMAND_VIEW_OPTIONS} onChange={setView} />
        }
        fileStem={`${scenario.name}-demand`}
        csv={() => demandCsv(demandPoints, measured, scenario.sectors)}
        toPng={() => chartRef.current?.toPng() ?? null}
        compareName={compareScenario?.name}
        controls={
          <ScenarioSelect
            id="demand-scenario"
            ariaLabel={t.demandScenario}
            value={active}
            presets={DEMAND_PRESETS}
            labels={t.demandPresets}
            colors={demandPresetColors}
            onChange={select}
          />
        }
        footer={`${note ? `${note} ` : ''}${he.sampleData}`}
      >
        <StackedAreaChart
          ref={chartRef}
          years={years}
          stacked={stacked}
          reduction={reduction}
          line={netLine}
          compare={compare}
          unit={unit}
          digits={digits}
          targetYear={targetYear}
          height={370}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Title order={3} fz="sm" mb={4}>
          {t.demandParams}
        </Title>
        {detail === 'high' && (
          <Text size="xs" c="dimmed" mb={4}>
            {t.centerHint(horizonYear)}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
          {scenario.sectors.flatMap((s, i) => {
            // The slider is in percent (display unit); the data is a fraction.
            const baseRate = presetBase.sectors.find((b) => b.key === s.key)?.growthRate ?? s.growthRate;
            const base = toPct(baseRate);
            const twh = horizonTWh.get(s.key) ?? 0;
            const delta =
              twh - toTWh(sectorTotalEnergy({ ...s, growthRate: baseRate }, horizonYear, baseYear, horizonYear));
            const elecSlider = (
              <CenteredSlider
                key={s.key}
                label={s.label}
                color={colorFor(sectorColors, s.key, i)}
                value={toPct(s.growthRate)}
                range={centeredRange(base, 3)}
                onChange={(pct) => updateSector(s.key, { growthRate: fromPct(Math.round(pct * 100) / 100) })}
                thumbLabel={t.growthThumb(s.label)}
                formatValue={(v) => `${v.toFixed(1)}%`}
                sideValue={`${fmt(twh, 0)} TWh`}
                sideNote={Math.abs(delta) < 0.5 ? t.base : t.vsBase(signed(delta))}
                gear={gear(s.key, t.details(s.label))}
              >
                <SectorDetails
                  sector={s}
                  baseYear={baseYear}
                  horizonYear={horizonYear}
                  onChange={(patch) => updateSector(s.key, patch)}
                />
              </CenteredSlider>
            );
            if (!hasNonElectric(s)) return [elecSlider];
            // The sector's fuels + direct gas (final energy), on their own growth rate.
            const neBaseRate =
              presetBase.sectors.find((b) => b.key === s.key)?.nonElectric?.growthRate ?? s.nonElectric!.growthRate;
            const neTwh = horizonNeTWh.get(s.key) ?? 0;
            const neSlider = (
              <CenteredSlider
                key={`${s.key}-ne`}
                label={t.nonElecLabel(s.label)}
                color={colorFor(sectorColors, s.key, i)}
                value={toPct(s.nonElectric!.growthRate)}
                range={centeredRange(toPct(neBaseRate), 3)}
                onChange={(pct) =>
                  updateSector(s.key, {
                    nonElectric: { ...s.nonElectric!, growthRate: fromPct(Math.round(pct * 100) / 100) },
                  })
                }
                thumbLabel={t.nonElecGrowthThumb(s.label)}
                formatValue={(v) => `${v.toFixed(1)}%`}
                sideValue={`${fmt(neTwh, 0)} TWh`}
              />
            );
            return [elecSlider, neSlider];
          })}
        </SimpleGrid>
        {hasSubSectors && view === 'sectors' && (
          <Checkbox
            size="xs"
            mt={6}
            label={t.expandSubSectors}
            title={t.expandSubSectorsHint}
            checked={transportExpanded}
            onChange={(e) => setTransportExpanded(e.currentTarget.checked)}
          />
        )}
        <MeasuresPanel />
      </Paper>
    </Stack>
  );
}

import { Checkbox, Group, Paper, SimpleGrid, Select, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef, useState } from 'react';
import { SUPPLY_PRESETS, supplyPresets } from '../../data/baseline';
import { he } from '../../i18n/he';
import { supplyCsv } from '../../io/csvExport';
import { NO_MEASURES } from '../../model/measures';
import { centeredRange } from '../../model/sliderRange';
import { computeSupply, interpolateCapacity, setCapacityAt } from '../../model/supply';
import { HOURS_PER_YEAR_K } from '../../model/years';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore } from '../../store/uiStore';
import { ChartCard } from '../charts/ChartCard';
import { colorFor, EFFICIENCY_COLOR, SAVING_COLOR, sourceColors } from '../charts/palette';
import { StackedAreaChart, type ChartHandle } from '../charts/StackedAreaChart';
import { AutoFillPanel } from '../controls/AutoFillPanel';
import { CenteredSlider } from '../controls/CenteredSlider';
import { SourceDetails } from '../controls/SourceDetails';
import { MeasuresPanel } from './MeasuresPanel';

const fmt = (v: number, d = 0) => v.toLocaleString('he-IL', { maximumFractionDigits: d });

export function SupplyColumn() {
  const scenario = useSupplyStore((s) => s.scenario);
  const updateSource = useSupplyStore((s) => s.updateSource);
  const active = useSupplyStore((s) => s.active);
  const select = useSupplyStore((s) => s.select);
  const presetBase = supplyPresets[active];
  const { baseYear, horizonYear, measures: demandMeasures } = useDemandStore((s) => s.scenario);
  const measures = demandMeasures ?? NO_MEASURES;
  const { targetYear, units, detail } = useUiStore();
  const { years, supplyPoints, gap, measured } = useSeries();
  const compareScenario = useCompareStore((s) => s.supply);
  const chartRef = useRef<ChartHandle>(null);
  const [gearOpen, setGearOpen] = useState<string | null>(null);
  const t = he.plan;
  const gw = units === 'gw';
  const unit = gw ? 'GW' : 'TWh';

  const stacked = useMemo(
    () =>
      scenario.sources
        .filter((s) => s.enabled)
        .map((s) => ({
          name: s.label,
          color: colorFor(sourceColors, s.key, scenario.sources.indexOf(s)),
          values: supplyPoints.filter((p) => p.source === s.key).map((p) => (gw ? p.firmGW : p.twh)),
        })),
    [scenario.sources, supplyPoints, gw],
  );
  // התייעלות וחיסכון: פס מקווקו מעל קו הביקוש נטו, עד הביקוש ברוטו.
  const hasReduction = measures.efficiencyPct > 0 || measures.savingPct > 0;
  const reduction = useMemo(() => {
    if (!hasReduction) return undefined;
    // במצב GW: ההפחתה בשיא באותו יחס כמו באנרגיה.
    const share = (m: (typeof measured)[number], twh: number) =>
      gw ? (m.grossTWh > 0 ? (m.grossPeakGW * twh) / m.grossTWh : 0) : twh;
    return {
      net: measured.map((m) => (gw ? m.netPeakGW : m.netTWh)),
      layers: [
        { name: t.saving, color: SAVING_COLOR, values: measured.map((m) => share(m, m.savingTWh)) },
        { name: t.efficiency, color: EFFICIENCY_COLOR, values: measured.map((m) => share(m, m.efficiencyTWh)) },
      ],
    };
  }, [hasReduction, measured, gw, t.saving, t.efficiency]);
  // הפער לא נצבע: הוא נשאר לבן, בין ראש הערימה לקו הביקוש.
  const line = useMemo(
    () => ({ name: t.netDemand, values: gap.map((g) => (gw ? g.peakDemandGW : g.demandTWh)) }),
    [gap, gw, t.netDemand],
  );
  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const pts = computeSupply(compareScenario, years);
    return [
      {
        name: he.compare.supplyLine(compareScenario.name),
        values: years.map((y) => pts.filter((p) => p.year === y).reduce((sum, p) => sum + (gw ? p.firmGW : p.twh), 0)),
      },
    ];
  }, [compareScenario, years, gw]);

  return (
    <Stack gap="sm">
      <ChartCard
        title={`${t.supplyTitle} (${unit})`}
        fileStem={`${scenario.name}-supply`}
        csv={() => supplyCsv(gap, supplyPoints, scenario.sources)}
        toPng={() => chartRef.current?.toPng() ?? null}
        compareName={compareScenario?.name}
        footer={`${t.gapWhite} ${gw ? he.supply.gwModeNote + ' ' : ''}${he.sampleData}`}
      >
        <StackedAreaChart
          ref={chartRef}
          years={years}
          stacked={stacked}
          line={line}
          reduction={reduction}
          compare={compare}
          unit={unit}
          targetYear={targetYear}
          height={370}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" gap="xs" wrap="wrap" mb={4}>
          <Title order={3} fz="sm">
            {t.supplyParams}
          </Title>
          <Select
            id="supply-scenario"
            size="xs"
            w={{ base: '100%', xs: 240 }}
            aria-label={t.supplyScenario}
            allowDeselect={false}
            checkIconPosition="right"
            value={active}
            onChange={(v) => v && select(v as typeof active)}
            data={SUPPLY_PRESETS.map((p) => ({ value: p, label: t.supplyPresets[p].label }))}
            renderOption={({ option }) => (
              <div>
                <Text size="sm">{option.label}</Text>
                <Text size="xs" c="dimmed">
                  {t.supplyPresets[option.value as typeof active].desc}
                </Text>
              </div>
            )}
          />
        </Group>
        {detail === 'high' && (
          <Text size="xs" c="dimmed" mb={4}>
            {t.supplyHint(horizonYear)}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
          {scenario.sources.map((s, i) => {
            const color = colorFor(sourceColors, s.key, i);
            const value = interpolateCapacity(s.capacityGW, horizonYear);
            const baseSrc = presetBase.sources.find((b) => b.key === s.key);
            const base = baseSrc ? interpolateCapacity(baseSrc.capacityGW, horizonYear) : value;
            const range = centeredRange(base, 5, 0);
            const retired = s.retireYear !== undefined && horizonYear >= s.retireYear;
            const twh = s.enabled && !retired ? value * s.capacityFactor * HOURS_PER_YEAR_K : 0;
            return (
              <CenteredSlider
                key={s.key}
                leading={
                  <Checkbox
                    size="xs"
                    checked={s.enabled}
                    aria-label={t.enable(s.label)}
                    onChange={(e) => updateSource(s.key, { enabled: e.currentTarget.checked })}
                  />
                }
                label={s.label}
                color={color}
                value={value}
                range={range}
                disabled={!s.enabled || retired}
                onChange={(v) =>
                  updateSource(s.key, {
                    capacityGW: setCapacityAt(s.capacityGW, horizonYear, Math.round(v * 100) / 100),
                  })
                }
                thumbLabel={t.capacityThumb(s.label, horizonYear)}
                formatValue={(v) => `${v.toFixed(1)} GW`}
                sideValue={retired ? t.retiredIn(s.retireYear!) : `${fmt(twh)} TWh`}
                sideNote={retired ? undefined : `${fmt(value, 1)} GW`}
                gear={{
                  open: gearOpen === s.key,
                  onToggle: () => setGearOpen(gearOpen === s.key ? null : s.key),
                  label: t.details(s.label),
                }}
              >
                <SourceDetails
                  source={s}
                  color={color}
                  minYear={baseYear}
                  maxYear={horizonYear}
                  onChange={(patch) => updateSource(s.key, patch)}
                />
              </CenteredSlider>
            );
          })}
        </SimpleGrid>
        <MeasuresPanel />
      </Paper>

      <AutoFillPanel />
    </Stack>
  );
}

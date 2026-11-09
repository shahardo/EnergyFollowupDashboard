import { Divider, Group, Paper, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMemo, useRef, useState } from 'react';
import { baselineDemand } from '../../data/baseline';
import { he } from '../../i18n/he';
import { demandCsv } from '../../io/csvExport';
import { demandTotals, projectDemand, sectorTWh } from '../../model/demand';
import { applyMeasures, NO_MEASURES } from '../../model/measures';
import { centeredRange } from '../../model/sliderRange';
import { MEASURE_MAX_PCT } from '../../schema';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { ChartCard } from '../charts/ChartCard';
import { colorFor, sectorColors } from '../charts/palette';
import { StackedAreaChart, type ChartHandle } from '../charts/StackedAreaChart';
import { CenteredSlider } from '../controls/CenteredSlider';
import { SectorDetails } from '../controls/SectorDetails';

export const EFFICIENCY_COLOR = '#0c8599';
export const SAVING_COLOR = '#5c940d';

const fmt = (v: number, d = 0) => v.toLocaleString('he-IL', { maximumFractionDigits: d });
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

export function DemandColumn() {
  const scenario = useDemandStore((s) => s.scenario);
  const updateSector = useDemandStore((s) => s.updateSector);
  const setMeasures = useDemandStore((s) => s.setMeasures);
  const rename = useDemandStore((s) => s.rename);
  const { targetYear, units } = useUiStore();
  const { years, demandPoints, measured } = useSeries();
  const compareScenario = useCompareStore((s) => s.demand);
  const chartRef = useRef<ChartHandle>(null);
  const [gearOpen, setGearOpen] = useState<string | null>(null);
  const t = he.plan;
  const gw = units === 'gw';
  const unit = gw ? 'GW' : 'TWh';
  const { baseYear, horizonYear } = scenario;
  const measures = scenario.measures ?? NO_MEASURES;

  const stacked = useMemo(
    () =>
      scenario.sectors.map((s, i) => ({
        name: s.label,
        color: colorFor(sectorColors, s.key, i),
        values: demandPoints.filter((p) => p.sector === s.key).map((p) => (gw ? p.peakGW : p.twh)),
      })),
    [scenario.sectors, demandPoints, gw],
  );

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
  const netLine = useMemo(
    () =>
      hasReduction ? { name: t.netDemand, values: measured.map((m) => (gw ? m.netPeakGW : m.netTWh)) } : undefined,
    [hasReduction, measured, gw, t.netDemand],
  );

  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const m = applyMeasures(
      demandTotals(projectDemand(compareScenario)),
      compareScenario.measures,
      compareScenario.baseYear,
      compareScenario.horizonYear,
    );
    return [
      {
        name: he.compare.demandLine(compareScenario.name),
        values: years.map((y) => {
          const p = m.find((x) => x.year === y);
          return p ? (gw ? p.netPeakGW : p.netTWh) : null;
        }) as number[],
      },
    ];
  }, [compareScenario, years, gw]);

  const horizon = measured.find((m) => m.year === horizonYear);

  return (
    <Stack gap="sm">
      <ChartCard
        title={`${t.demandTitle} (${unit})`}
        fileStem={`${scenario.name}-demand`}
        csv={() => demandCsv(demandPoints, measured, scenario.sectors)}
        toPng={() => chartRef.current?.toPng() ?? null}
        compareName={compareScenario?.name}
        footer={he.sampleData}
      >
        <StackedAreaChart
          ref={chartRef}
          years={years}
          stacked={stacked}
          reduction={reduction}
          line={netLine}
          lineSolid
          compare={compare}
          unit={unit}
          targetYear={targetYear}
          height={340}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" gap="xs" wrap="wrap" mb={4}>
          <Title order={3} fz="sm">
            {t.demandParams}
          </Title>
          <TextInput
            id="demand-name"
            size="xs"
            w={{ base: '100%', xs: 240 }}
            aria-label={`${t.scenarioName}: ${t.demandTitle}`}
            value={scenario.name}
            onChange={(e) => rename(e.currentTarget.value)}
          />
        </Group>
        <Text size="xs" c="dimmed" mb={4}>
          {t.centerHint(horizonYear)}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
          {scenario.sectors.map((s, i) => {
            const base = baselineDemand.sectors.find((b) => b.key === s.key)?.growthPct ?? s.growthPct;
            const range = centeredRange(base, 3);
            const twh = demandPoints.find((p) => p.sector === s.key && p.year === horizonYear)?.twh ?? 0;
            const baseTwh = sectorTWh({ ...s, growthPct: base }, horizonYear, baseYear, horizonYear);
            const delta = twh - baseTwh;
            return (
              <CenteredSlider
                key={s.key}
                label={s.label}
                color={colorFor(sectorColors, s.key, i)}
                value={s.growthPct}
                range={range}
                onChange={(growthPct) => updateSector(s.key, { growthPct: Math.round(growthPct * 100) / 100 })}
                thumbLabel={t.growthThumb(s.label)}
                formatValue={(v) => `${v.toFixed(1)}%`}
                sideValue={`${fmt(twh)} TWh`}
                sideNote={Math.abs(delta) < 0.5 ? t.base : t.vsBase(signed(delta))}
                gear={{
                  open: gearOpen === s.key,
                  onToggle: () => setGearOpen(gearOpen === s.key ? null : s.key),
                  label: t.details(s.label),
                }}
              >
                <SectorDetails
                  sector={s}
                  baseYear={baseYear}
                  horizonYear={horizonYear}
                  onChange={(patch) => updateSector(s.key, patch)}
                />
              </CenteredSlider>
            );
          })}
        </SimpleGrid>

        <Divider my="sm" label={t.measuresTitle} labelPosition="right" />
        <Text size="xs" c="dimmed" mb={4}>
          {t.measuresHint(horizonYear)}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
          {(
            [
              {
                key: 'efficiencyPct',
                label: t.efficiency,
                hint: t.efficiencyHint,
                color: EFFICIENCY_COLOR,
                saved: horizon?.efficiencyTWh ?? 0,
              },
              {
                key: 'savingPct',
                label: t.saving,
                hint: t.savingHint,
                color: SAVING_COLOR,
                saved: horizon?.savingTWh ?? 0,
              },
            ] as const
          ).map((m) => (
            <div key={m.key} title={m.hint}>
              <CenteredSlider
                label={m.label}
                color={m.color}
                value={measures[m.key]}
                range={{ min: 0, max: MEASURE_MAX_PCT, step: 1 }}
                centered={false}
                onChange={(v) => setMeasures({ [m.key]: v })}
                thumbLabel={t.reductionThumb(m.label)}
                formatValue={(v) => `${v}%`}
                sideValue={m.saved > 0.05 ? `−${fmt(m.saved)} TWh` : '0 TWh'}
                sideNote={`${measures[m.key]}%`}
              />
            </div>
          ))}
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}

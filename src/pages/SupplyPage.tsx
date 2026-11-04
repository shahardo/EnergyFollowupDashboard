import { Alert, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { StackedAreaChart } from '../components/charts/StackedAreaChart';
import { colorFor, sourceColors } from '../components/charts/palette';
import { SourceToggle } from '../components/controls/SourceToggle';
import { KpiCard } from '../components/layout/KpiCard';
import { he } from '../i18n/he';
import { useDemandStore } from '../store/demandStore';
import { useSeries } from '../store/useSeries';
import { useSupplyStore } from '../store/supplyStore';
import { useUiStore } from '../store/uiStore';
import { fmt, fmtPct } from './format';

export function SupplyPage() {
  const scenario = useSupplyStore((s) => s.scenario);
  const updateSource = useSupplyStore((s) => s.updateSource);
  const demand = useDemandStore((s) => s.scenario);
  const { targetYear, units } = useUiStore();
  const { years, supplyPoints, gap } = useSeries();
  const t = he.supply;
  const gw = units === 'gw';
  const unit = gw ? 'GW' : 'TWh';

  const stacked = useMemo(
    () =>
      scenario.sources
        .filter((s) => s.enabled)
        .map((s, i) => ({
          name: s.label,
          color: colorFor(sourceColors, s.key, i),
          values: supplyPoints.filter((p) => p.source === s.key).map((p) => (gw ? p.firmGW : p.twh)),
        })),
    [scenario.sources, supplyPoints, gw],
  );
  const line = useMemo(
    () => ({ name: t.demandLine, values: gap.map((g) => (gw ? g.peakDemandGW : g.demandTWh)) }),
    [gap, gw, t.demandLine],
  );
  const gapSeries = useMemo(
    () => ({ name: t.gap, color: '#e03131', values: gap.map((g) => (gw ? g.peakGapGW : g.gapTWh)) }),
    [gap, gw, t.gap],
  );

  const g = gap.find((x) => x.year === targetYear) ?? gap[gap.length - 1];
  const mismatch = scenario.demandScenarioRef && scenario.demandScenarioRef !== demand.name;
  const okColor = (pct: number) => (pct >= 100 ? 'teal' : pct >= 90 ? 'orange' : 'red');

  return (
    <Stack gap="md">
      {mismatch && (
        <Alert color="yellow" variant="light">
          {t.mismatch(scenario.demandScenarioRef!, demand.name)}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <KpiCard
          label={`${t.coverage} ${g.year}`}
          value={fmtPct(g.coveragePct)}
          color={okColor(g.coveragePct)}
          hint={g.gapTWh > 0 ? `${t.gapTWh}: ${fmt(g.gapTWh)} TWh` : t.noGap}
        />
        <KpiCard
          label={`${t.peakCoverage} ${g.year}`}
          value={fmtPct(g.peakCoveragePct)}
          color={okColor(g.peakCoveragePct)}
          hint={g.peakGapGW > 0 ? `${t.peakGap}: ${fmt(g.peakGapGW)} GW` : t.noGap}
        />
        <KpiCard label={`${t.renewable} ${g.year}`} value={fmtPct(g.renewablePct)} />
        <KpiCard label={`${he.demand.total} ${g.year}`} value={`${fmt(g.demandTWh, 0)} TWh`} hint={`${fmt(g.peakDemandGW)} GW`} />
      </SimpleGrid>
      <Paper withBorder p="sm" radius="md">
        <Title order={2} fz="md" mb="xs">
          {t.title} ({unit})
        </Title>
        <StackedAreaChart
          years={years}
          stacked={stacked}
          line={line}
          gap={gapSeries}
          unit={unit}
          targetYear={targetYear}
        />
        <Text size="xs" c="dimmed" mt={4}>
          {gw ? t.gwModeNote + ' ' : ''}
          {he.sampleData}
        </Text>
      </Paper>
      <Title order={2} fz="md">
        {t.sources}
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        {scenario.sources.map((s, i) => (
          <SourceToggle
            key={s.key}
            source={s}
            color={colorFor(sourceColors, s.key, i)}
            minYear={demand.baseYear}
            maxYear={demand.horizonYear}
            onChange={(patch) => updateSource(s.key, patch)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

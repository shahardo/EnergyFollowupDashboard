import { Alert, Grid, SimpleGrid, Stack, Title } from '@mantine/core';
import { useMemo, useRef } from 'react';
import { ChartCard } from '../components/charts/ChartCard';
import { StackedAreaChart, type ChartHandle } from '../components/charts/StackedAreaChart';
import { AutoFillPanel } from '../components/controls/AutoFillPanel';
import { supplyCsv } from '../io/csvExport';
import { computeSupply } from '../model/supply';
import { useCompareStore } from '../store/compareStore';
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
  const chartRef = useRef<ChartHandle>(null);
  const { years, supplyPoints, gap } = useSeries();
  const compareScenario = useCompareStore((s) => s.supply);
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

  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const pts = computeSupply(compareScenario, years);
    return [
      {
        name: he.compare.supplyLine(compareScenario.name),
        values: years.map((y) =>
          pts.filter((p) => p.year === y).reduce((sum, p) => sum + (gw ? p.firmGW : p.twh), 0),
        ),
      },
    ];
  }, [compareScenario, years, gw]);

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
      <Grid gutter="sm">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <ChartCard
            title={`${t.title} (${unit})`}
            fileStem={`${scenario.name}-supply`}
            csv={() => supplyCsv(gap, supplyPoints, scenario.sources)}
            compareName={compareScenario?.name}
            toPng={() => chartRef.current?.toPng() ?? null}
            footer={(gw ? t.gwModeNote + ' ' : '') + he.sampleData}
          >
            <StackedAreaChart ref={chartRef} years={years} stacked={stacked} line={line} gap={gapSeries} compare={compare} unit={unit} targetYear={targetYear} />
          </ChartCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <AutoFillPanel />
        </Grid.Col>
      </Grid>
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

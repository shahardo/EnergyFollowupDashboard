import { Alert, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useRef } from 'react';
import { ChartCard } from '../components/charts/ChartCard';
import type { ChartHandle } from '../components/charts/echartsCore';
import { colorFor, sourceColors } from '../components/charts/palette';
import { StackedAreaChart } from '../components/charts/StackedAreaChart';
import { KpiCard } from '../components/layout/KpiCard';
import { OptionsPanel, WeightsPanel } from '../components/priority/PriorityControls';
import { RankingTable } from '../components/priority/RankingTable';
import { he } from '../i18n/he';
import { supplyCsv } from '../io/csvExport';
import { computeGap } from '../model/gap';
import { idealSupply, meritScore, mixMetrics } from '../model/priority';
import { computeSupply } from '../model/supply';
import { maxGWFrom, usePriorityStore, useScoreOf } from '../store/priorityStore';
import { useSeries } from '../store/useSeries';
import { useSupplyStore } from '../store/supplyStore';
import { useUiStore } from '../store/uiStore';
import { fmt, fmtPct } from '../utils/format';

/**
 * טאב תעדוף הערוצים: משקלות לשיקולים (קיימות, מחיר, ביטחון, יישימות), דירוג 14 הערוצים לפי הציון המשוקלל,
 * ועקומת האספקה האידאלית שנבנית לפי הדירוג מהצי הקיים (idealSupply), מול התרחיש הפעיל. כפתור מחיל אותה
 * על תרחיש ההיצע הפעיל (עם ביטול).
 */
export function PriorityPage() {
  const scenario = useSupplyStore((s) => s.scenario);
  const applyAutoFill = useSupplyStore((s) => s.applyAutoFill);
  const undo = useSupplyStore((s) => s.undoAutoFill);
  const canUndo = useSupplyStore((s) => s.previous !== null);
  const weights = usePriorityStore((s) => s.weights);
  const minFeasibilityPct = usePriorityStore((s) => s.minFeasibilityPct);
  const retireBelow = usePriorityStore((s) => s.retireBelow);
  const retireByYear = usePriorityStore((s) => s.retireByYear);
  const editedMax = usePriorityStore((s) => s.maxGW);
  const resetScores = usePriorityStore((s) => s.resetScores);
  const scoreOf = useScoreOf();
  const targetYear = useUiStore((s) => s.targetYear);
  const { years, totals, supplyPoints, gap } = useSeries();
  const chartRef = useRef<ChartHandle>(null);
  const t = he.priority;

  const maxGW = useMemo(() => maxGWFrom(editedMax), [editedMax]);
  const result = useMemo(
    () => idealSupply(totals, scenario, scoreOf, { weights, minFeasibilityPct, retireBelow, retireByYear, maxGW }),
    [totals, scenario, scoreOf, weights, minFeasibilityPct, retireBelow, retireByYear, maxGW],
  );
  const idealPoints = useMemo(() => computeSupply(result.scenario, years), [result, years]);
  const idealGap = useMemo(() => computeGap(totals, idealPoints, result.scenario), [totals, idealPoints, result]);
  const idealMix = useMemo(() => mixMetrics(idealPoints, scoreOf), [idealPoints, scoreOf]);
  const activeMix = useMemo(() => mixMetrics(supplyPoints, scoreOf), [supplyPoints, scoreOf]);

  const baseYear = years[0];
  const horizonYear = years[years.length - 1];
  const kpiYears = [...new Set([targetYear, horizonYear])].filter((y) => years.includes(y)).sort((a, b) => a - b);
  const at = <T extends { year: number }>(xs: T[], y: number) => xs.find((x) => x.year === y);

  // ── הגרף ────────────────────────────────────────────────────────────────
  const stacked = useMemo(
    () =>
      result.scenario.sources
        .filter((s) => idealPoints.some((p) => p.source === s.key && p.twh > 0.005))
        .map((s) => ({
          name: s.label,
          color: colorFor(sourceColors, s.key, result.scenario.sources.indexOf(s)),
          values: idealPoints.filter((p) => p.source === s.key).map((p) => p.twh),
        })),
    [result, idealPoints],
  );
  const line = useMemo(() => ({ name: he.plan.netDemand, values: totals.map((d) => d.twh) }), [totals]);
  const compare = useMemo(
    () => [{ name: t.activeLine(scenario.name), values: gap.map((g) => g.supplyTWh) }],
    [gap, scenario.name, t],
  );

  const apply = () => {
    applyAutoFill(result.scenario);
    notifications.show({ color: 'teal', message: t.applied(scenario.name) });
  };

  const kpis = [
    {
      label: t.kpi.co2,
      value: (m: (typeof idealMix)[number]) => fmt(m.mtCo2, 1),
    },
    {
      label: t.kpi.merit,
      value: (m: (typeof idealMix)[number]) => fmt(meritScore(m.score, weights), 1),
    },
    {
      label: t.kpi.feasibility,
      value: (m: (typeof idealMix)[number]) => fmtPct(m.score.feasibilityPct),
    },
  ];

  return (
    <Stack gap="sm">
      <div>
        <Title order={2} fz="md">
          {t.title}
        </Title>
        <Text size="xs" c="dimmed">
          {t.hint}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <WeightsPanel />
        <OptionsPanel />
      </SimpleGrid>

      {result.shortfall.length > 0 && (
        <Alert color="red" variant="light">
          {t.shortfall(
            result.shortfall.length > 3
              ? `${result.shortfall[0].year}–${result.shortfall[result.shortfall.length - 1].year}`
              : result.shortfall.map((s) => s.year).join(', '),
          )}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="sm">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            values={kpiYears.map((y) => {
              const m = at(idealMix, y);
              const a = at(activeMix, y);
              return { year: y, value: m ? k.value(m) : '–', hint: a ? t.kpi.active(k.value(a)) : undefined };
            })}
          />
        ))}
        <KpiCard
          label={t.kpi.renewable}
          values={kpiYears.map((y) => {
            const g = at(idealGap, y);
            const a = at(gap, y);
            return {
              year: y,
              value: g ? fmtPct(g.renewablePct) : '–',
              hint: a ? t.kpi.active(fmtPct(a.renewablePct)) : undefined,
            };
          })}
        />
      </SimpleGrid>

      <ChartCard
        title={t.chartTitle}
        fileStem={`${scenario.name}-ideal`}
        csv={() => supplyCsv(idealGap, idealPoints, result.scenario.sources)}
        toPng={() => chartRef.current?.toPng() ?? null}
        footer={`${t.chartFooter} ${he.sampleData}`}
      >
        <StackedAreaChart
          ref={chartRef}
          years={years}
          stacked={stacked}
          line={line}
          lineSolid
          compare={compare}
          unit="TWh"
          targetYear={targetYear}
          height={360}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" mb={4} wrap="wrap" gap="xs">
          <Title order={3} fz="sm">
            {t.rankingTitle}
          </Title>
          <Group gap={6}>
            <Button size="xs" onClick={apply}>
              {t.apply}
            </Button>
            <Button size="xs" variant="default" onClick={undo} disabled={!canUndo}>
              {t.undo}
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={resetScores}>
              {t.resetScores}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed" mb="xs">
          {t.rankingHint}
        </Text>
        <RankingTable
          scenario={scenario}
          result={result}
          scoreOf={scoreOf}
          maxGW={maxGW}
          baseYear={baseYear}
          horizonYear={horizonYear}
        />
      </Paper>
    </Stack>
  );
}

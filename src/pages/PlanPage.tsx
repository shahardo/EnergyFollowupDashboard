import { toGW, toPct, toTWh } from '../model/units';
import { Alert, Grid, SimpleGrid, Stack } from '@mantine/core';
import { KpiCard } from '../components/layout/KpiCard';
import { SharedScaleProvider } from '../components/charts/sharedScale';
import { DemandColumn } from '../components/plan/DemandColumn';
import { SupplyColumn } from '../components/plan/SupplyColumn';
import { he } from '../i18n/he';
import { useDemandStore } from '../store/demandStore';
import { useSeries } from '../store/useSeries';
import { useSupplyStore } from '../store/supplyStore';
import { useUiStore } from '../store/uiStore';
import { fmt, fmtPct, ltr } from '../utils/format';

/** דף התכנון: גרף הביקוש וגרף ההיצע זה לצד זה, וכל אחד עם הפאנל שלו מתחתיו. */
export function PlanPage() {
  const demandName = useDemandStore((s) => s.scenario.name);
  const supplyRef = useSupplyStore((s) => s.scenario.demandScenarioRef);
  const targetYear = useUiStore((s) => s.targetYear);
  const { gap, measured } = useSeries();
  const horizonYear = useDemandStore((s) => s.scenario.horizonYear);
  // כל כרטיס מציג את שנת היעד ואת שנת האופק (ברירת מחדל: 2035 ו-2050).
  const kpiYears = [...new Set([targetYear, horizonYear])].sort((a, b) => a - b);
  const rows = kpiYears
    .map((year) => ({ g: gap.find((x) => x.year === year), m: measured.find((x) => x.year === year) }))
    .filter((r): r is { g: (typeof gap)[number]; m: (typeof measured)[number] | undefined } => !!r.g);
  const s = he.supply;
  const okColor = (share: number) => (share >= 1 ? 'teal' : share >= 0.9 ? 'orange' : 'red');

  return (
    <Stack gap="md">
      {supplyRef && supplyRef !== demandName && (
        <Alert color="yellow" variant="light">
          {s.mismatch(supplyRef, demandName)}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 5 }} spacing="sm">
        <KpiCard
          label={he.plan.netDemand}
          values={rows.map(({ g, m }) => ({
            year: g.year,
            value: `${fmt(toTWh(g.demandEnergy), 0)} TWh`,
            hint:
              m && toTWh(m.grossEnergy - m.netEnergy) > 0.05 ? he.plan.grossHint(fmt(toTWh(m.grossEnergy), 0)) : undefined,
          }))}
        />
        <KpiCard
          label={he.demand.peak}
          values={rows.map(({ g }) => ({ year: g.year, value: `${fmt(toGW(g.peakDemand))} GW` }))}
        />
        <KpiCard
          label={s.coverage}
          values={rows.map(({ g }) => ({
            year: g.year,
            value: fmtPct(toPct(g.coverage)),
            color: okColor(g.coverage),
            hint: g.gapEnergy > 0 ? `${s.gapShort}: ${ltr(`${fmt(toTWh(g.gapEnergy))} TWh`)}` : s.noGap,
          }))}
        />
        <KpiCard
          label={s.peakCoverage}
          values={rows.map(({ g }) => ({
            year: g.year,
            value: fmtPct(toPct(g.peakCoverage)),
            color: okColor(g.peakCoverage),
            hint: g.peakGap > 0 ? `${s.gapShort}: ${ltr(`${fmt(toGW(g.peakGap))} GW`)}` : s.noGap,
          }))}
        />
        <KpiCard
          label={s.renewable}
          values={rows.map(({ g }) => ({ year: g.year, value: fmtPct(toPct(g.renewableShare)) }))}
        />
      </SimpleGrid>
      <SharedScaleProvider>
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <DemandColumn />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <SupplyColumn />
          </Grid.Col>
        </Grid>
      </SharedScaleProvider>
    </Stack>
  );
}

import { Alert, Grid, SimpleGrid, Stack } from '@mantine/core';
import { KpiCard } from '../components/layout/KpiCard';
import { DemandColumn } from '../components/plan/DemandColumn';
import { SupplyColumn } from '../components/plan/SupplyColumn';
import { he } from '../i18n/he';
import { useDemandStore } from '../store/demandStore';
import { useSeries } from '../store/useSeries';
import { useSupplyStore } from '../store/supplyStore';
import { useUiStore } from '../store/uiStore';
import { fmt, fmtPct } from './format';

/** דף התכנון: גרף הביקוש וגרף ההיצע זה לצד זה, וכל אחד עם הפאנל שלו מתחתיו. */
export function PlanPage() {
  const demandName = useDemandStore((s) => s.scenario.name);
  const supplyRef = useSupplyStore((s) => s.scenario.demandScenarioRef);
  const targetYear = useUiStore((s) => s.targetYear);
  const { gap, measured } = useSeries();
  const g = gap.find((x) => x.year === targetYear) ?? gap[gap.length - 1];
  const m = measured.find((x) => x.year === g.year);
  const s = he.supply;
  const okColor = (pct: number) => (pct >= 100 ? 'teal' : pct >= 90 ? 'orange' : 'red');
  const reduced = m ? m.grossTWh - m.netTWh : 0;

  return (
    <Stack gap="md">
      {supplyRef && supplyRef !== demandName && (
        <Alert color="yellow" variant="light">
          {s.mismatch(supplyRef, demandName)}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
        <KpiCard
          label={`${he.plan.netDemand} ${g.year}`}
          value={`${fmt(g.demandTWh, 0)} TWh`}
          hint={reduced > 0.05 && m ? he.plan.grossHint(fmt(m.grossTWh, 0)) : undefined}
        />
        <KpiCard label={`${he.demand.peak} ${g.year}`} value={`${fmt(g.peakDemandGW)} GW`} />
        <KpiCard
          label={`${s.coverage} ${g.year}`}
          value={fmtPct(g.coveragePct)}
          color={okColor(g.coveragePct)}
          hint={g.gapTWh > 0 ? `${s.gapTWh}: ${fmt(g.gapTWh)} TWh` : s.noGap}
        />
        <KpiCard
          label={`${s.peakCoverage} ${g.year}`}
          value={fmtPct(g.peakCoveragePct)}
          color={okColor(g.peakCoveragePct)}
          hint={g.peakGapGW > 0 ? `${s.peakGap}: ${fmt(g.peakGapGW)} GW` : s.noGap}
        />
        <KpiCard label={`${s.renewable} ${g.year}`} value={fmtPct(g.renewablePct)} />
      </SimpleGrid>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <DemandColumn />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <SupplyColumn />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

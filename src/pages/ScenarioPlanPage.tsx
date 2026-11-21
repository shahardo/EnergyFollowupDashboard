import { Grid } from '@mantine/core';
import { SharedScaleProvider } from '../components/charts/sharedScale';
import { DemandColumn } from '../components/plan/DemandColumn';
import { PlanSupplyColumn } from '../components/plan/PlanSupplyColumn';

/**
 * The scenario-planning tab: on the right the demand chart (the same column as in the demand-and-supply tab,
 * including non-electric demand), on the left the supply by the fill rules. Each chart's own view selector
 * (sector/energy source, channel/final energy) sits in its title, and is shared across every tab.
 */
export function ScenarioPlanPage() {
  return (
    <SharedScaleProvider>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <DemandColumn allFuels />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <PlanSupplyColumn />
        </Grid.Col>
      </Grid>
    </SharedScaleProvider>
  );
}

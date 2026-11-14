import { Grid } from '@mantine/core';
import { DemandColumn } from '../components/plan/DemandColumn';
import { PlanSupplyColumn } from '../components/plan/PlanSupplyColumn';
import { useUiStore } from '../store/uiStore';

/**
 * טאב תכנון התרחישים: מימין גרף הביקוש (אותה עמודה כמו בטאב תרחישי הביקוש והאספקה, כולל הביקוש שאינו
 * חשמל), ומשמאל האספקה לפי כללי המילוי. התצוגה: לפי מגזרים או לפי מקורות אנרגיה סופיים.
 */
export function ScenarioPlanPage() {
  const view = useUiStore((s) => s.planView);
  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <DemandColumn view={view} allFuels />
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <PlanSupplyColumn />
      </Grid.Col>
    </Grid>
  );
}

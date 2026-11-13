import { planSourceMeta } from '../data/scenarioPlan';
import { measureNonElectric, projectNonElectric, type NonElectricPoint } from '../model/carriers';
import { planSupply, type PlanSupply } from '../model/scenarioPlan';
import type { DemandSeries } from '../model/series';
import type { DemandScenario, ScenarioPlanParams } from '../schema';
import { useDemandStore } from './demandStore';
import { useScenarioPlanStore } from './scenarioPlanStore';
import { useSeries } from './useSeries';

// מטמונים ברמת המודול (כמו useSeries): כל הרכיבים משתפים חישוב אחד.
let neCache: { points: DemandSeries['demandPoints']; value: NonElectricPoint[] } | null = null;
let planCache: { totals: DemandSeries['totals']; params: ScenarioPlanParams; value: PlanSupply } | null = null;

/** הביקוש שאינו חשמל לפי מגזר ושנה (ברוטו), מהמטמון כשהביקוש לחשמל לא השתנה. */
function nonElectricFor(demand: DemandScenario, series: DemandSeries): NonElectricPoint[] {
  if (neCache?.points !== series.demandPoints) neCache = { points: series.demandPoints, value: projectNonElectric(demand, series.demandPoints) };
  return neCache.value;
}

/** הביקוש שאינו חשמל (דלקים וגז ישיר) לפי מגזר ושנה, לפני התייעלות וחיסכון. */
export function useNonElectric(): NonElectricPoint[] {
  const demand = useDemandStore((s) => s.scenario);
  return nonElectricFor(demand, useSeries());
}

/**
 * האספקה של טאב תכנון התרחישים: מקורות החשמל לפי הכללים (הגז משלים את הביקוש נטו לחשמל),
 * והדלקים והגז הישיר לפי הביקוש שאינו חשמל (נטו). מחושב מחדש רק כשהביקוש או הפרמטרים משתנים.
 */
export function usePlanSupply(): PlanSupply {
  const demand = useDemandStore((s) => s.scenario);
  const params = useScenarioPlanStore((s) => s.params);
  const series = useSeries();
  if (planCache?.totals !== series.totals || planCache.params !== params) {
    const m = measureNonElectric(demand, nonElectricFor(demand, series), series.years);
    const fuels = series.years.map((year, i) => ({ year, fuelsTWh: m.fuels[i].netTWh, gasTWh: m.gas[i].netTWh }));
    planCache = {
      totals: series.totals,
      params,
      value: planSupply(params, planSourceMeta, series.years, series.totals, fuels, demand.baseYear, demand.horizonYear),
    };
  }
  return planCache.value;
}

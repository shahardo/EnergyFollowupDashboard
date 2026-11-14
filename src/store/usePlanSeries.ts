import { planParamsOf } from '../data/scenarioPlan';
import { measureNonElectric, projectNonElectric, type NonElectricPoint } from '../model/carriers';
import { planSupply, type PlanSupply } from '../model/scenarioPlan';
import type { DemandSeries } from '../model/series';
import type { DemandScenario, SupplyScenario } from '../schema';
import { useDemandStore } from './demandStore';
import { useSupplyStore } from './supplyStore';
import { useSeries } from './useSeries';

// מטמונים ברמת המודול (כמו useSeries): כל הרכיבים משתפים חישוב אחד.
let neCache: { points: DemandSeries['demandPoints']; value: NonElectricPoint[] } | null = null;
let planCache: { totals: DemandSeries['totals']; supply: SupplyScenario; value: PlanSupply } | null = null;

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
 * האספקה של טאב תכנון התרחישים, מתרחיש ההיצע המשותף: מקורות החשמל (מקוצצים בביקוש נטו לחשמל),
 * והדלקים והגז הישיר לפי הביקוש שאינו חשמל (נטו). מחושב מחדש רק כשהביקוש או ההיצע משתנים.
 */
export function usePlanSupply(): PlanSupply {
  const demand = useDemandStore((s) => s.scenario);
  const supply = useSupplyStore((s) => s.scenario);
  const series = useSeries();
  if (planCache?.totals !== series.totals || planCache.supply !== supply) {
    const m = measureNonElectric(demand, nonElectricFor(demand, series), series.years);
    const fuels = series.years.map((year, i) => ({ year, fuelsTWh: m.fuels[i].netTWh, gasTWh: m.gas[i].netTWh }));
    planCache = {
      totals: series.totals,
      supply,
      value: planSupply(supply, planParamsOf(supply), series.years, series.totals, fuels, demand.horizonYear),
    };
  }
  return planCache.value;
}

import type { DemandScenario, SupplyScenario } from '../schema';
import { computeDemandSeries, computeSeries, type DemandSeries, type Series } from '../model/series';
import { useDemandStore } from './demandStore';
import { useSupplyStore } from './supplyStore';

// מטמון ברמת המודול, לפי זהות האובייקטים בחנויות: כל הרכיבים שקוראים ל-useSeries משתפים חישוב אחד,
// ושינוי בהיצע לא מחשב מחדש את הביקוש.
let demandCache: { demand: DemandScenario; value: DemandSeries } | null = null;
let seriesCache: { d: DemandSeries; supply: SupplyScenario; value: Series } | null = null;

/** הסדרות המחושבות לזוג תרחישים, מהמטמון כשהתרחישים לא השתנו. */
export function seriesFor(demand: DemandScenario, supply: SupplyScenario): Series {
  if (demandCache?.demand !== demand) demandCache = { demand, value: computeDemandSeries(demand) };
  const d = demandCache.value;
  if (seriesCache?.d !== d || seriesCache.supply !== supply) {
    seriesCache = { d, supply, value: computeSeries(d, supply) };
  }
  return seriesCache.value;
}

/**
 * הסדרות המחושבות מהתרחישים הפעילים (ראו model/series.ts). מחושב מחדש רק כשתרחיש משתנה.
 * totals הוא הביקוש **נטו**, אחרי התייעלות וחיסכון; ממנו מחושבים הפער וההשלמה האוטומטית.
 * grossTotals הוא הביקוש לפני ההפחתות (סכום המגזרים).
 */
export function useSeries(): Series {
  const demand = useDemandStore((s) => s.scenario);
  const supply = useSupplyStore((s) => s.scenario);
  return seriesFor(demand, supply);
}

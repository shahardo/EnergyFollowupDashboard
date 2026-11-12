import type { DemandScenario, SupplyScenario } from '../schema';
import { demandTotals, projectDemand, type DemandPoint, type DemandTotal } from './demand';
import { computeGap, type GapPoint } from './gap';
import { applyMeasures, netTotals, type MeasuredTotal } from './measures';
import { computeSupply, type SupplyPoint } from './supply';
import { yearRange } from './years';

/** צד הביקוש של שרשרת החישוב. */
export interface DemandSeries {
  years: number[];
  demandPoints: DemandPoint[];
  /** הביקוש לפני ההפחתות (סכום המגזרים). */
  grossTotals: DemandTotal[];
  /** הביקוש לפני ואחרי ההפחתות, ופירוק ההפחתה. */
  measured: MeasuredTotal[];
  /** הביקוש **נטו**, אחרי התייעלות וחיסכון; ממנו מחושבים הפער וההשלמה האוטומטית. */
  totals: DemandTotal[];
}

/** כל הסדרות המחושבות מתרחיש ביקוש ותרחיש היצע. */
export interface Series extends DemandSeries {
  supplyPoints: SupplyPoint[];
  gap: GapPoint[];
}

/** ביקוש לפי מגזר → סך ברוטו → הפחתות → ביקוש נטו. */
export function computeDemandSeries(demand: DemandScenario): DemandSeries {
  const years = yearRange(demand.baseYear, demand.horizonYear);
  const demandPoints = projectDemand(demand);
  const grossTotals = demandTotals(demandPoints);
  const measured = applyMeasures(grossTotals, demand.measures, demand.baseYear, demand.horizonYear);
  return { years, demandPoints, grossTotals, measured, totals: netTotals(measured) };
}

/** משלים את צד ההיצע והפער לסדרות ביקוש שכבר חושבו. */
export function computeSeries(d: DemandSeries, supply: SupplyScenario): Series {
  const supplyPoints = computeSupply(supply, d.years);
  return { ...d, supplyPoints, gap: computeGap(d.totals, supplyPoints, supply) };
}

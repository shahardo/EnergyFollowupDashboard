import { useMemo } from 'react';
import { useDemandStore } from './demandStore';
import { useSupplyStore } from './supplyStore';
import { demandTotals, projectDemand } from '../model/demand';
import { computeGap } from '../model/gap';
import { applyMeasures, netTotals } from '../model/measures';
import { computeSupply } from '../model/supply';
import { yearRange } from '../model/years';

/**
 * הסדרות המחושבות מהתרחישים הפעילים. מחושב מחדש רק כשתרחיש משתנה.
 * totals הוא הביקוש **נטו**, אחרי התייעלות וחיסכון; ממנו מחושבים הפער וההשלמה האוטומטית.
 * grossTotals הוא הביקוש לפני ההפחתות (סכום המגזרים).
 */
export function useSeries() {
  const demand = useDemandStore((s) => s.scenario);
  const supply = useSupplyStore((s) => s.scenario);
  return useMemo(() => {
    const years = yearRange(demand.baseYear, demand.horizonYear);
    const demandPoints = projectDemand(demand);
    const grossTotals = demandTotals(demandPoints);
    const measured = applyMeasures(grossTotals, demand.measures, demand.baseYear, demand.horizonYear);
    const totals = netTotals(measured);
    const supplyPoints = computeSupply(supply, years);
    const gap = computeGap(totals, supplyPoints, supply);
    return { years, demandPoints, grossTotals, measured, totals, supplyPoints, gap };
  }, [demand, supply]);
}

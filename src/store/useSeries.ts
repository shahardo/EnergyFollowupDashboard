import { useMemo } from 'react';
import { useDemandStore } from './demandStore';
import { useSupplyStore } from './supplyStore';
import { demandTotals, projectDemand } from '../model/demand';
import { computeGap } from '../model/gap';
import { computeSupply } from '../model/supply';
import { yearRange } from '../model/years';

/** הסדרות המחושבות מהתרחישים הפעילים. מחושב מחדש רק כשתרחיש משתנה. */
export function useSeries() {
  const demand = useDemandStore((s) => s.scenario);
  const supply = useSupplyStore((s) => s.scenario);
  return useMemo(() => {
    const years = yearRange(demand.baseYear, demand.horizonYear);
    const demandPoints = projectDemand(demand);
    const totals = demandTotals(demandPoints);
    const supplyPoints = computeSupply(supply, years);
    const gap = computeGap(totals, supplyPoints, supply);
    return { years, demandPoints, totals, supplyPoints, gap };
  }, [demand, supply]);
}

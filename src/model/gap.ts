import type { SupplyScenario } from '../schema';
import type { DemandTotal } from './demand';
import type { SupplyPoint } from './supply';

export interface GapPoint {
  year: number;
  demandTWh: number;
  supplyTWh: number;
  /** ביקוש פחות היצע, רק כשהוא חיובי. */
  gapTWh: number;
  coveragePct: number;
  peakDemandGW: number;
  firmGW: number;
  peakGapGW: number;
  peakCoveragePct: number;
  renewablePct: number;
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 100);

export function computeGap(
  demand: DemandTotal[],
  supply: SupplyPoint[],
  scenario: SupplyScenario,
): GapPoint[] {
  const renewable = new Set(scenario.sources.filter((s) => s.renewable).map((s) => s.key));
  return demand.map((d) => {
    const ys = supply.filter((p) => p.year === d.year);
    const supplyTWh = ys.reduce((sum, p) => sum + p.twh, 0);
    const firmGW = ys.reduce((sum, p) => sum + p.firmGW, 0);
    const renewableTWh = ys.filter((p) => renewable.has(p.source)).reduce((s, p) => s + p.twh, 0);
    return {
      year: d.year,
      demandTWh: d.twh,
      supplyTWh,
      gapTWh: Math.max(0, d.twh - supplyTWh),
      coveragePct: pct(supplyTWh, d.twh),
      peakDemandGW: d.peakGW,
      firmGW,
      peakGapGW: Math.max(0, d.peakGW - firmGW),
      peakCoveragePct: pct(firmGW, d.peakGW),
      renewablePct: supplyTWh > 0 ? (renewableTWh / supplyTWh) * 100 : 0,
    };
  });
}

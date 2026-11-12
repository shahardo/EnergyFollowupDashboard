import type { SupplyScenario } from '../schema';
import type { DemandTotal } from './demand';
import type { SupplyPoint } from './supply';

/** הפער בין הביקוש להיצע בשנה אחת: אנרגיה, שיא וחלק המתחדשות. */
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

const EMPTY_YEAR = { twh: 0, firm: 0, renewable: 0 };

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 100);

/**
 * משווה בכל שנה את הביקוש (נטו) להיצע: אנרגיה (TWh) מול ייצור, ושיא (GW) מול הספק יציב (firm).
 * כיסוי של שנה בלי ביקוש הוא 100%. חלק המתחדשות לפי השדה renewable של כל מקור.
 */
export function computeGap(
  demand: DemandTotal[],
  supply: SupplyPoint[],
  scenario: SupplyScenario,
): GapPoint[] {
  const renewable = new Set(scenario.sources.filter((s) => s.renewable).map((s) => s.key));
  // סכומי ההיצע לפי שנה, במעבר אחד על כל הנקודות.
  const byYear = new Map<number, { twh: number; firm: number; renewable: number }>();
  for (const p of supply) {
    const t = byYear.get(p.year) ?? { twh: 0, firm: 0, renewable: 0 };
    t.twh += p.twh;
    t.firm += p.firmGW;
    if (renewable.has(p.source)) t.renewable += p.twh;
    byYear.set(p.year, t);
  }
  return demand.map((d) => {
    const { twh: supplyTWh, firm: firmGW, renewable: renewableTWh } = byYear.get(d.year) ?? EMPTY_YEAR;
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

import type { SupplyScenario } from '../schema';
import type { DemandTotal } from './demand';
import type { SupplyPoint } from './supply';

/** הפער בין הביקוש להיצע בשנה אחת: אנרגיה (J), שיא (W) וחלק המתחדשות (שברים). */
export interface GapPoint {
  year: number;
  demandEnergy: number;
  supplyEnergy: number;
  /** ביקוש פחות היצע, רק כשהוא חיובי. */
  gapEnergy: number;
  /** כיסוי אנרגטי (שבר; 1 = מלא). */
  coverage: number;
  peakDemand: number;
  firmPower: number;
  peakGap: number;
  /** כיסוי השיא (שבר). */
  peakCoverage: number;
  /** חלק המתחדשות מהייצור (שבר). */
  renewableShare: number;
}

const EMPTY_YEAR = { energy: 0, firm: 0, renewable: 0 };

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 1);

/**
 * משווה בכל שנה את הביקוש (נטו) להיצע: אנרגיה מול ייצור, ושיא מול הספק יציב (firm).
 * כיסוי של שנה בלי ביקוש הוא 1. חלק המתחדשות לפי השדה renewable של כל מקור.
 */
export function computeGap(demand: DemandTotal[], supply: SupplyPoint[], scenario: SupplyScenario): GapPoint[] {
  const renewable = new Set(scenario.sources.filter((s) => s.renewable).map((s) => s.key));
  // סכומי ההיצע לפי שנה, במעבר אחד על כל הנקודות.
  const byYear = new Map<number, { energy: number; firm: number; renewable: number }>();
  for (const p of supply) {
    const t = byYear.get(p.year) ?? { energy: 0, firm: 0, renewable: 0 };
    t.energy += p.energy;
    t.firm += p.firmPower;
    if (renewable.has(p.source)) t.renewable += p.energy;
    byYear.set(p.year, t);
  }
  return demand.map((d) => {
    const { energy: supplyEnergy, firm: firmPower, renewable: renewableEnergy } = byYear.get(d.year) ?? EMPTY_YEAR;
    return {
      year: d.year,
      demandEnergy: d.energy,
      supplyEnergy,
      gapEnergy: Math.max(0, d.energy - supplyEnergy),
      coverage: share(supplyEnergy, d.energy),
      peakDemand: d.peak,
      firmPower,
      peakGap: Math.max(0, d.peak - firmPower),
      peakCoverage: share(firmPower, d.peak),
      renewableShare: supplyEnergy > 0 ? renewableEnergy / supplyEnergy : 0,
    };
  });
}

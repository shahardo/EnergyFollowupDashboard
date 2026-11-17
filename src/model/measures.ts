import type { Measures } from '../schema';
import type { DemandTotal } from './demand';
import { linearShare } from './math';

/** בלי התייעלות ובלי חיסכון. */
export const NO_MEASURES: Measures = { efficiency: 0, saving: 0 };

/** 0 בשנת הבסיס, ועולה לינארית עד 1 בשנת האופק. */
export const rampShare = (year: number, baseYear: number, horizonYear: number): number =>
  linearShare(year, baseYear, horizonYear);

/** הביקוש של שנה אחת לפני ואחרי ההפחתות (J, ושיא ב-W), ופירוק ההפחתה. */
export interface MeasuredTotal {
  year: number;
  grossEnergy: number;
  netEnergy: number;
  grossPeak: number;
  netPeak: number;
  /** האנרגיה (J) שההתייעלות חוסכת בשנה הזו. */
  efficiencyEnergy: number;
  /** האנרגיה (J) שהחיסכון חוסך, אחרי ההתייעלות. */
  savingEnergy: number;
}

/**
 * מפחית מהביקוש את ההתייעלות ואת החיסכון. שניהם מפחיתים אנרגיה ושיא באותו שבר.
 * ההפחתות מצטברות כפל, (1 − e)(1 − s): 0.3 ועוד 0.3 הם 0.51, לא 0.6.
 */
export function applyMeasures(
  totals: DemandTotal[],
  measures: Measures | undefined,
  baseYear: number,
  horizonYear: number,
): MeasuredTotal[] {
  const m = measures ?? NO_MEASURES;
  return totals.map((t) => {
    const r = rampShare(t.year, baseYear, horizonYear);
    const e = m.efficiency * r;
    const s = m.saving * r;
    const afterEff = t.energy * (1 - e);
    const net = afterEff * (1 - s);
    return {
      year: t.year,
      grossEnergy: t.energy,
      netEnergy: net,
      grossPeak: t.peak,
      netPeak: t.peak * (1 - e) * (1 - s),
      efficiencyEnergy: t.energy - afterEff,
      savingEnergy: afterEff - net,
    };
  });
}

/** הביקוש נטו בצורה ש-computeGap ו-autoFill מצפים לה. */
export const netTotals = (m: MeasuredTotal[]): DemandTotal[] =>
  m.map((x) => ({ year: x.year, energy: x.netEnergy, peak: x.netPeak }));

import type { Measures } from '../schema';
import type { DemandTotal } from './demand';

export const NO_MEASURES: Measures = { efficiencyPct: 0, savingPct: 0 };

/** 0 בשנת הבסיס, ועולה לינארית עד 1 בשנת האופק. */
export function rampShare(year: number, baseYear: number, horizonYear: number): number {
  if (horizonYear <= baseYear) return year >= horizonYear ? 1 : 0;
  return Math.min(1, Math.max(0, (year - baseYear) / (horizonYear - baseYear)));
}

export interface MeasuredTotal {
  year: number;
  grossTWh: number;
  netTWh: number;
  grossPeakGW: number;
  netPeakGW: number;
  /** ה-TWh שההתייעלות חוסכת בשנה הזו. */
  efficiencyTWh: number;
  /** ה-TWh שהחיסכון חוסך, אחרי ההתייעלות. */
  savingTWh: number;
}

/**
 * מפחית מהביקוש את ההתייעלות ואת החיסכון. שניהם מפחיתים אנרגיה ושיא באותו אחוז.
 * ההפחתות מצטברות כפל, (1 − e)(1 − s): 30% ועוד 30% הם 51%, לא 60%.
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
    const e = (m.efficiencyPct / 100) * r;
    const s = (m.savingPct / 100) * r;
    const afterEff = t.twh * (1 - e);
    const net = afterEff * (1 - s);
    return {
      year: t.year,
      grossTWh: t.twh,
      netTWh: net,
      grossPeakGW: t.peakGW,
      netPeakGW: t.peakGW * (1 - e) * (1 - s),
      efficiencyTWh: t.twh - afterEff,
      savingTWh: afterEff - net,
    };
  });
}

/** הביקוש נטו בצורה ש-computeGap ו-autoFill מצפים לה. */
export const netTotals = (m: MeasuredTotal[]): DemandTotal[] =>
  m.map((x) => ({ year: x.year, twh: x.netTWh, peakGW: x.netPeakGW }));

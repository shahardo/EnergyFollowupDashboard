/** סקאלת ציר ה-Y: ראש "עגול" לציר, והערך הגבוה ביותר שגרף מצייר. פונקציות טהורות. */

/** סדרה בגרף: ערך לכל שנה (null = אין ערך). */
interface Values {
  values: (number | null)[];
}

/** כמה מרווחים בערך בציר. */
const TARGET_INTERVALS = 5;
const STEPS = [1, 2, 2.5, 5, 10];

/**
 * ראש ציר "עגול" מעל v: צעד של 1 / 2 / 2.5 / 5 × 10ᵏ כך שיש בערך חמישה מרווחים, והראש הוא כפולה של הצעד.
 * מחזיר את הראש ואת הצעד (לשנתות). ערך לא חיובי מקבל ציר של 0..1.
 */
export function niceAxisMax(v: number): { max: number; interval: number } {
  if (!(v > 0) || !Number.isFinite(v)) return { max: 1, interval: 0.2 };
  const raw = v / TARGET_INTERVALS;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = (STEPS.find((s) => s * mag >= raw - 1e-12) ?? 10) * mag;
  const max = Math.ceil(v / step - 1e-9) * step;
  return { max: +max.toPrecision(12), interval: +step.toPrecision(12) };
}

/**
 * הנקודה הגבוהה ביותר שגרף מצייר: בכל שנה סכום השכבות הנערמות, ראש פס ההפחתות (נטו + השכבות),
 * וכל קו (ביקוש, גבולות, השוואה).
 */
export function seriesMax(input: {
  stacked: Values[];
  reduction?: { net: number[]; layers: Values[] };
  lines?: (Values | undefined)[];
}): number {
  let max = 0;
  const n = Math.max(0, ...input.stacked.map((s) => s.values.length));
  for (let i = 0; i < n; i++) {
    max = Math.max(max, input.stacked.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  }
  if (input.reduction) {
    input.reduction.net.forEach((v, i) => {
      max = Math.max(max, v + input.reduction!.layers.reduce((a, l) => a + Math.max(0, l.values[i] ?? 0), 0));
    });
  }
  for (const l of input.lines ?? []) for (const v of l?.values ?? []) if (v !== null) max = Math.max(max, v);
  return max;
}

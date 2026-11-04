/** כל השנים מ-from עד to, כולל שתיהן. */
export function yearRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

/** שעות בשנה חלקי 1000: ממיר GW לאורך שנה שלמה ל-TWh. */
export const HOURS_PER_YEAR_K = 8.76;

/** עזרי חישוב קטנים שמשותפים לכמה מודולים במודל. */

/** v בתוך הטווח lo..hi. */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * המיקום היחסי (0..1) של x בין a ל-b, חסום בשני הקצוות.
 * בטווח מנוון (b ≤ a): 1 מ-b והלאה, 0 לפניו.
 */
export function linearShare(x: number, a: number, b: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  return clamp((x - a) / (b - a), 0, 1);
}

/**
 * עיגול כלפי מעלה ל-0.01 (GW), עם סובלנות קטנה כדי ש-1.2300000001 לא יהפוך ל-1.24.
 * ההשלמה האוטומטית מעגלת כלפי מעלה כדי שהעיגול לא ישאיר פער קטן.
 */
export const roundUp2 = (v: number): number => Math.ceil(v * 100 - 1e-6) / 100;

/** עיגול רגיל ל-0.01. */
export const round2 = (v: number): number => Math.round(v * 100) / 100;

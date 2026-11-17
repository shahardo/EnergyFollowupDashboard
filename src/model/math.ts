/** עזרי חישוב קטנים שמשותפים לכמה מודולים במודל. */
import { W_PER_GW } from './units';

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

/** צעד העיגול של הספק: 0.01 GW (‎1e7 W). */
export const POWER_STEP = 0.01 * W_PER_GW;

/**
 * עיגול הספק (W) כלפי מעלה לצעד של 0.01 GW, עם סובלנות קטנה כדי ש-1.2300000001 GW לא יהפוך ל-1.24.
 * ההשלמה האוטומטית מעגלת כלפי מעלה כדי שהעיגול לא ישאיר פער קטן.
 */
export const roundUpPower = (w: number): number => Math.ceil(w / POWER_STEP - 1e-6) * POWER_STEP;

/** עיגול רגיל של הספק (W) לצעד של 0.01 GW. */
export const roundPower = (w: number): number => Math.round(w / POWER_STEP) * POWER_STEP;

/** עיגול רגיל ל-0.01. */
export const round2 = (v: number): number => Math.round(v * 100) / 100;

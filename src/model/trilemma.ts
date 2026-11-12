import { clamp } from './math';

/** ציוני טרילמת האנרגיה של ערוץ אספקה: שלושה צירים בסולם 0..10, ויישימות באחוזים. */
export interface TrilemmaScore {
  /** ביטחון אנרגטי: אמינות, עצמאות, עמידות לשיבושים. */
  security: number;
  /** נגישות כלכלית: עלות לצרכן ולמשק. */
  affordability: number;
  /** קיימות סביבתית: פליטות, קרקע, השפעה על הסביבה. */
  sustainability: number;
  /** יישימות בישראל (0..100): עד כמה הערוץ מעשי בטווח התכנון. */
  feasibilityPct: number;
}

/** שלושת צירי הטרילמה, בסדר הציור. */
export const TRILEMMA_AXES = ['security', 'affordability', 'sustainability'] as const;
export type TrilemmaAxis = (typeof TRILEMMA_AXES)[number];
/** הציון המרבי בכל ציר: המשולש החיצוני. */
const TRILEMMA_MAX = 10;

/** כיוון כל ציר במעלות (0 = ימינה, נגד כיוון השעון): ביטחון למעלה, ואז שני הקודקודים התחתונים. */
const AXIS_ANGLE: Record<TrilemmaAxis, number> = { security: 90, affordability: 210, sustainability: 330 };

/** נקודה על ציר: value בסולם 0..10, ב-SVG (ציר y כלפי מטה), סביב מרכז (cx, cy) ברדיוס r. */
export function axisPoint(axis: TrilemmaAxis, value: number, cx: number, cy: number, r: number): [number, number] {
  const a = (AXIS_ANGLE[axis] * Math.PI) / 180;
  const k = (clamp(value, 0, TRILEMMA_MAX) / TRILEMMA_MAX) * r;
  return [cx + k * Math.cos(a), cy - k * Math.sin(a)];
}

/** שלושת קודקודי המשולש של הציונים. */
export function trianglePoints(s: TrilemmaScore, cx: number, cy: number, r: number): [number, number][] {
  return TRILEMMA_AXES.map((ax) => axisPoint(ax, s[ax], cx, cy, r));
}

/** ציון משוקלל פשוט (ממוצע שלושת הצירים, 0..10). */
export const trilemmaMean = (s: TrilemmaScore) => (s.security + s.affordability + s.sustainability) / 3;

/** הגוון של הערוץ ה-i מתוך n: מרווחים שווים על גלגל הצבעים. */
export const trilemmaHue = (i: number, n: number) => (n > 0 ? Math.round((i * 360) / n + 210) % 360 : 210);

/**
 * צבע לפי היישימות: ביישימות מלאה צבע רווי; ככל שהיישימות יורדת, הרוויה יורדת והבהירות עולה,
 * לכיוון אפור בהיר. מחזיר hsl().
 */
export function feasibilityColor(hue: number, feasibilityPct: number, lightnessShift = 0): string {
  const f = clamp(feasibilityPct / 100, 0, 1);
  const s = 72 * f;
  const l = 48 + (80 - 48) * (1 - f) + lightnessShift;
  return `hsl(${hue} ${s.toFixed(0)}% ${Math.min(96, l).toFixed(0)}%)`;
}

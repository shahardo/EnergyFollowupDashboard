import { TRILEMMA_AXES, axisPoint, type TrilemmaScore } from './trilemma';

/**
 * פירמידת הטרילמה: משולש הציונים מונח על "רצפה" אופקית, וקודקוד הפירמידה מעל מרכז הכובד שלו,
 * בגובה יחסי ליישימות. היטל אורתוגרפי: המבט מסתובב סביב הציר האנכי (yaw) ומוטה מעל האופק (pitch).
 * pitch 0 = מבט מהצד (הרצפה קו), 90° = מבט מלמעלה (ציר היישימות פונה ישר אל הצופה).
 *
 * קואורדינטות תלת-ממדיות: X ימינה, Y למעלה (גובה), Z לעומק (חיובי = רחוק). מרכז הרצפה ב-(0,0,0).
 */
export type Vec3 = [number, number, number];

/** זווית המבט מעל האופק (ברדיאנים) כברירת מחדל: הרצפה מתקצרת בעומק פי sin, הגובה פי cos (יחס 1:2). */
export const PITCH = Math.atan(0.5);
/** טווח ההטיה: מבט מהצד עד כמעט מלמעלה. */
export const PITCH_MIN = 0;
export const PITCH_MAX = (80 * Math.PI) / 180;
/** סיבוב המבט סביב הציר האנכי (ברדיאנים), כדי שהפאות לא ייראו סימטריות ושטוחות. */
export const YAW = (20 * Math.PI) / 180;

/** נקודה על הרצפה מתוך ציון על ציר: מיקום הציר ב-2D הופך לעומק (ציר הביטחון מאחור). */
export function groundPoint(axis: (typeof TRILEMMA_AXES)[number], value: number, r: number): Vec3 {
  const [x, y] = axisPoint(axis, value, 0, 0, r);
  return [x, 0, -y];
}

/**
 * היטל של נקודה תלת-ממדית למסך (SVG, y כלפי מטה), אחרי סיבוב yaw סביב הציר האנכי שעובר ב-pivot
 * והטיה pitch מעל האופק. ה-pivot מוטל בדיוק ל-(cx, cy).
 */
export function project(
  [x, y, z]: Vec3,
  cx: number,
  cy: number,
  pitch = PITCH,
  yaw = YAW,
  pivot: Vec3 = [0, 0, 0],
): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = x - pivot[0];
  const dz = z - pivot[2];
  return [cx + dx * c - dz * s, cy - (dx * s + dz * c) * Math.sin(pitch) - (y - pivot[1]) * Math.cos(pitch)];
}

/** כיוון המבט, משותף לכל הפירמידות: סיבוב סביב ציר היישימות והטיה של הציר אל הצופה. */
export interface PyramidView {
  yaw: number;
  pitch: number;
}
export const DEFAULT_VIEW: PyramidView = { yaw: YAW, pitch: PITCH };

/** הטיה בטווח PITCH_MIN..PITCH_MAX. */
export const clampPitch = (pitch: number) => Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch));

/** זווית בטווח −π..π. */
export function normalizeYaw(yaw: number): number {
  const t = 2 * Math.PI;
  const r = (((yaw + Math.PI) % t) + t) % t;
  return r - Math.PI;
}

/** וקטור כלפי הצופה (מלמעלה ומלפנים), מנורמל. נקודות לאורכו מוטלות לאותה נקודה במסך. */
export function viewDir(pitch = PITCH, yaw = YAW): Vec3 {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n > 1e-9 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};

/** כיוון האור במערכת המצלמה (מלמעלה, משמאל ומלפנים): האור מסתובב עם המבט, כך שהפאה שפונה לצופה תמיד מוארת. */
const LIGHT_CAM = unit([-0.5, 1, -0.6]);

/** וקטור במערכת המצלמה → מערכת העולם, לפי yaw (ההפך מהסיבוב של project). */
function camToWorld([x, y, z]: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, y, -x * s + z * c];
}

export interface PyramidFace {
  /** שלושת הקודקודים (שניים על הרצפה והקודקוד העליון), בתלת-ממד. */
  points: [Vec3, Vec3, Vec3];
  /** הנורמל החיצוני, מנורמל. */
  normal: Vec3;
  /** האם הפאה פונה אל הצופה (פאות אחוריות לא מצוירות). */
  visible: boolean;
  /** עוצמת התאורה 0..1 (למפל בהירות בין הפאות, לא לקידוד נתונים). */
  light: number;
}

export interface Pyramid {
  base: [Vec3, Vec3, Vec3];
  /** מרכז הכובד של הבסיס, על הרצפה. */
  centroid: Vec3;
  apex: Vec3;
  height: number;
  faces: PyramidFace[];
}

/**
 * בונה את הפירמידה: הבסיס = משולש הציונים ברדיוס r, הגובה = maxHeight × יישימות.
 * הפאות לפי סדר: ביטחון–מחיר, מחיר–קיימות, קיימות–ביטחון. yaw ו-pitch קובעים אילו פאות גלויות; האור מסתובב עם yaw.
 */
export function buildPyramid(score: TrilemmaScore, r: number, maxHeight: number, yaw = YAW, pitch = PITCH): Pyramid {
  const base = TRILEMMA_AXES.map((ax) => groundPoint(ax, score[ax], r)) as [Vec3, Vec3, Vec3];
  const centroid: Vec3 = [(base[0][0] + base[1][0] + base[2][0]) / 3, 0, (base[0][2] + base[1][2] + base[2][2]) / 3];
  const height = maxHeight * Math.min(1, Math.max(0, score.feasibilityPct / 100));
  const apex: Vec3 = [centroid[0], height, centroid[2]];
  // נקודה פנימית, מעט מתחת לרצפה, כך שגם בפירמידה שטוחה הנורמלים פונים למעלה
  const inside: Vec3 = [centroid[0], height / 4 - 1e-3, centroid[2]];
  const view = viewDir(pitch, yaw);
  const light = camToWorld(LIGHT_CAM, yaw);

  const faces = base.map((a, i): PyramidFace => {
    const b = base[(i + 1) % 3];
    let n = unit(cross(sub(b, a), sub(apex, a)));
    const mid: Vec3 = [(a[0] + b[0] + apex[0]) / 3, (a[1] + b[1] + apex[1]) / 3, (a[2] + b[2] + apex[2]) / 3];
    if (dot(n, sub(mid, inside)) < 0) n = [-n[0], -n[1], -n[2]];
    const degenerate = n[0] === 0 && n[1] === 0 && n[2] === 0;
    return {
      points: [a, b, apex],
      normal: n,
      visible: !degenerate && dot(n, view) > 1e-6,
      light: Math.max(0, dot(n, light)),
    };
  });

  return { base, centroid, apex, height, faces };
}

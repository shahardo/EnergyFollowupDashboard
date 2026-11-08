export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

const niceStep = (span: number) => (span <= 2 ? 0.05 : span <= 10 ? 0.1 : span <= 40 ? 0.5 : 1);

/**
 * טווח סליידר שהערך הבסיסי נמצא בדיוק באמצעו.
 * span הוא המרחק מהבסיס לכל צד: לפחות minSpan, ולפחות |base| (כך ש-15% נותן 0..30%).
 * floor, אם ניתן, הוא הגבול התחתון (למשל 0 להספק): אז הטווח הוא floor..2×base, והבסיס עדיין באמצע.
 */
export function centeredRange(base: number, minSpan: number, floor?: number): SliderRange {
  let span = Math.max(minSpan, Math.abs(base));
  if (floor !== undefined && base - span < floor) {
    // לא יורדים מתחת ל-floor: הטווח הוא floor..2×base, והבסיס עדיין באמצע.
    // בסיס שיושב על ה-floor (למשל 0 GW) לא יכול להיות באמצע; אז floor..floor+2×minSpan.
    if (base - floor <= 0) {
      const step0 = niceStep(minSpan);
      return { min: floor, max: floor + 2 * minSpan, step: step0 };
    }
    span = base - floor;
  }
  const step = niceStep(span);
  const round = (v: number) => Math.round(v / step) * step;
  span = floor !== undefined ? span : Math.max(step, round(span));
  return { min: +(base - span).toFixed(4), max: +(base + span).toFixed(4), step };
}

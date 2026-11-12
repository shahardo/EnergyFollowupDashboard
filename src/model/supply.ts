import type { CapacityPoint, SupplyScenario, SupplySource } from '../schema';
import { round2 } from './math';
import { HOURS_PER_YEAR_K } from './years';

/** הייצור של מקור אחד בשנה אחת. */
export interface SupplyPoint {
  year: number;
  source: string;
  gw: number;
  twh: number;
  firmGW: number;
}

/** אינטרפולציה לינארית בין נקודות העוגן. לפני הנקודה הראשונה ואחרי האחרונה הערך קבוע. */
export function interpolateCapacity(points: CapacityPoint[], year: number): number {
  if (points.length === 0) return 0;
  // הנקודות כמעט תמיד כבר ממוינות (setCapacityAt ממיין); ממיינים עותק רק כשצריך.
  const isSorted = points.every((p, i) => i === 0 || points[i - 1].year <= p.year);
  const sorted = isSorted ? points : [...points].sort((a, b) => a.year - b.year);
  if (year <= sorted[0].year) return sorted[0].gw;
  const last = sorted[sorted.length - 1];
  if (year >= last.year) return last.gw;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (year <= b.year) {
      return a.gw + ((b.gw - a.gw) * (year - a.year)) / (b.year - a.year);
    }
  }
  return last.gw;
}

/** TWh בשנה של gw הספק מותקן במקדם ניצול cf: GW × CF × 8.76. */
export const energyTWh = (gw: number, cf: number): number => gw * cf * HOURS_PER_YEAR_K;

/** ההספק המותקן של מקור בשנה מסוימת, אחרי סימון ההשתתפות ושנת ההוצאה משימוש. */
export function sourceCapacity(source: SupplySource, year: number): number {
  if (!source.enabled) return 0;
  if (source.retireYear !== undefined && year >= source.retireYear) return 0;
  return interpolateCapacity(source.capacityGW, year);
}

/** TWh = GW × CF × 8.76, ו-firmGW = GW × capacityCredit */
export function computeSupply(scenario: SupplyScenario, years: number[]): SupplyPoint[] {
  const out: SupplyPoint[] = [];
  for (const year of years) {
    for (const s of scenario.sources) {
      const gw = sourceCapacity(s, year);
      out.push({
        year,
        source: s.key,
        gw,
        twh: energyTWh(gw, s.capacityFactor),
        firmGW: gw * s.capacityCredit,
      });
    }
  }
  return out;
}

/** קובע את ההספק בשנה מסוימת: מעדכן את נקודת העוגן של השנה, או מוסיף אחת. שאר הנקודות לא משתנות. */
export function setCapacityAt(points: CapacityPoint[], year: number, gw: number): CapacityPoint[] {
  const exists = points.some((p) => p.year === year);
  const next = exists ? points.map((p) => (p.year === year ? { year, gw } : p)) : [...points, { year, gw }];
  return next.sort((a, b) => a.year - b.year);
}

/** משנה ערך של סליידר מקור משנה זו ואילך. */
export const SCALE_FROM_YEAR = 2030;

/**
 * קובע את ההספק בשנת האופק ל-gw, ומכפיל את כל נקודות העוגן מ-fromYear ועד שנת האופק באותו יחס
 * (חדש / ישן), כך שצורת העקומה נשמרת. אם אין נקודה ב-fromYear נוספת אחת (בערך המאונטרפל).
 * נקודות לפני fromYear לא משתנות. אם הערך הישן באופק 0 אין יחס, ונקבע רק ערך האופק.
 */
export function scaleCapacityFrom(
  points: CapacityPoint[],
  fromYear: number,
  horizonYear: number,
  gw: number,
): CapacityPoint[] {
  const old = interpolateCapacity(points, horizonYear);
  if (old <= 0 || fromYear >= horizonYear || points.length === 0) {
    return setCapacityAt(points, horizonYear, gw);
  }
  const factor = gw / old;
  let next = setCapacityAt(points, horizonYear, old);
  const firstYear = next[0].year;
  if (fromYear > firstYear && !next.some((p) => p.year === fromYear)) {
    next = setCapacityAt(next, fromYear, interpolateCapacity(points, fromYear));
  }
  return next.map((p) =>
    p.year === horizonYear
      ? { year: p.year, gw }
      : p.year >= fromYear && p.year < horizonYear
        ? { year: p.year, gw: round2(p.gw * factor) }
        : p,
  );
}

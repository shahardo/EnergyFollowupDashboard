import type { CapacityPoint, SupplyScenario, SupplySource } from '../schema';
import type { DemandTotal } from './demand';
import { interpolateCapacity, sourceCapacity } from './supply';
import { HOURS_PER_YEAR_K } from './years';

export const AUTOFILL_STEP_YEARS = 5;

/**
 * פער השיא מכוסה קודם ממקורות "יציבים" (capacity credit של 0.5 לפחות: אגירה, גז, יבוא).
 * מקור עם credit נמוך (סולארי 0.05) היה צריך פי 20 הספק כדי לכסות אותו GW של שיא,
 * ולכן משתמשים בו לשיא רק אם אין מקור יציב פנוי.
 */
export const FIRM_CREDIT_MIN = 0.5;

export interface AutoFillResult {
  scenario: SupplyScenario;
  /** ה-GW שנוספו לכל מקור בשנה האחרונה של התקופה. */
  addedGW: Record<string, number>;
}

/** שנות העוגן של ההשלמה: כל 5 שנים משנת הבסיס, ושנת האופק. */
export function autoFillYears(years: number[]): number[] {
  if (years.length === 0) return [];
  const first = years[0];
  const last = years[years.length - 1];
  const out = years.filter((y) => (y - first) % AUTOFILL_STEP_YEARS === 0);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const isRetired = (s: SupplySource, year: number) => s.retireYear !== undefined && year >= s.retireYear;

/**
 * מילוי חמדני של הפער לפי fillPriority.
 * בכל שנת עוגן: קודם מכסים את פער האנרגיה (מקורות עם CF > 0), ואחר כך את פער השיא:
 * קודם ממקורות יציבים (FIRM_CREDIT_MIN), ורק אחריהם משאר המקורות. כל מקור מוגבל ב-maxGW, אם הוגדר.
 * הספק שנבנה לא יורד: התוספת בשנת עוגן היא לפחות התוספת בשנת העוגן הקודמת.
 * מקור כבוי שקיבל תוספת מופעל, וההספק שלו הוא התוספת בלבד.
 */
export function autoFill(demand: DemandTotal[], scenario: SupplyScenario): AutoFillResult {
  const years = demand.map((d) => d.year);
  const anchors = autoFillYears(years);
  const byKey = new Map(scenario.sources.map((s) => [s.key, s]));
  const priority = scenario.fillPriority.map((k) => byKey.get(k)).filter((s): s is SupplySource => !!s);

  const baseCap = (s: SupplySource, y: number) => (s.enabled ? sourceCapacity(s, y) : 0);
  const added = new Map<string, number>(priority.map((s) => [s.key, 0]));
  const addedAt = new Map<string, CapacityPoint[]>(priority.map((s) => [s.key, []]));

  for (const y of anchors) {
    const d = demand.find((x) => x.year === y);
    if (!d) continue;
    const cap = (s: SupplySource) =>
      isRetired(s, y) ? 0 : baseCap(s, y) + (added.get(s.key) ?? 0);

    let energyGap = d.twh - scenario.sources.reduce((sum, s) => sum + cap(s) * s.capacityFactor * HOURS_PER_YEAR_K, 0);
    let peakGap = d.peakGW - scenario.sources.reduce((sum, s) => sum + cap(s) * s.capacityCredit, 0);

    const grow = (s: SupplySource, wanted: number) => {
      const room = s.maxGW === undefined ? Infinity : Math.max(0, s.maxGW - cap(s));
      const gw = Math.min(wanted, room);
      if (gw <= 0) return 0;
      added.set(s.key, (added.get(s.key) ?? 0) + gw);
      return gw;
    };

    for (const s of priority) {
      if (energyGap <= 1e-9) break;
      if (isRetired(s, y) || s.capacityFactor <= 0) continue;
      const gw = grow(s, energyGap / (s.capacityFactor * HOURS_PER_YEAR_K));
      energyGap -= gw * s.capacityFactor * HOURS_PER_YEAR_K;
      peakGap -= gw * s.capacityCredit;
    }
    const firm = priority.filter((s) => s.capacityCredit >= FIRM_CREDIT_MIN);
    const weak = priority.filter((s) => s.capacityCredit > 0 && s.capacityCredit < FIRM_CREDIT_MIN);
    for (const s of [...firm, ...weak]) {
      if (peakGap <= 1e-9) break;
      if (isRetired(s, y)) continue;
      const gw = grow(s, peakGap / s.capacityCredit);
      peakGap -= gw * s.capacityCredit;
    }
    for (const s of priority) addedAt.get(s.key)!.push({ year: y, gw: added.get(s.key) ?? 0 });
  }

  const addedGW: Record<string, number> = {};
  const sources = scenario.sources.map((s) => {
    const points = addedAt.get(s.key);
    const total = added.get(s.key) ?? 0;
    if (!points || total <= 1e-9) return s;
    addedGW[s.key] = total;
    // מעגלים כלפי מעלה ל-0.01 GW, כדי שהעיגול לא ישאיר פער קטן.
    const round = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;
    if (!s.enabled) {
      return { ...s, enabled: true, capacityGW: points.map((p) => ({ year: p.year, gw: round(p.gw) })) };
    }
    const allYears = [...new Set([...s.capacityGW.map((p) => p.year), ...points.map((p) => p.year)])].sort(
      (a, b) => a - b,
    );
    return {
      ...s,
      capacityGW: allYears.map((year) => ({
        year,
        gw: round(interpolateCapacity(s.capacityGW, year) + interpolateCapacity(points, year)),
      })),
    };
  });

  return { scenario: { ...scenario, sources }, addedGW };
}

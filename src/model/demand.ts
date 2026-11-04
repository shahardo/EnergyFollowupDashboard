import type { DemandScenario, SectorDemand } from '../schema';
import { HOURS_PER_YEAR_K, yearRange } from './years';

export interface DemandPoint {
  year: number;
  sector: string;
  twh: number;
  peakGW: number;
}

const logistic = (t: number, k: number, mid: number) => 1 / (1 + Math.exp(-k * (t - mid)));

/**
 * הביקוש של מגזר אחד בשנה מסוימת, ב-TWh.
 * - linear: צמיחה קבועה באחוזים משנת הבסיס.
 * - exp: ריבית דריבית.
 * - s: עקומה לוגיסטית שמתחילה בערך הבסיס ומגיעה בשנת האופק לאותו ערך כמו exp,
 *   עם נקודת פיתול ב-sMidYear (ברירת מחדל: אמצע התקופה).
 * ההתייעלות מוחלת בסוף, כהפחתה מצטברת של efficiencyPct בכל שנה.
 */
export function sectorTWh(
  sector: SectorDemand,
  year: number,
  baseYear: number,
  horizonYear: number,
): number {
  const t = Math.max(0, year - baseYear);
  const g = sector.growthPct / 100;
  let value: number;
  switch (sector.curve) {
    case 'linear':
      value = sector.baseTWh * (1 + g * t);
      break;
    case 'exp':
      value = sector.baseTWh * Math.pow(1 + g, t);
      break;
    case 's': {
      const T = Math.max(1, horizonYear - baseYear);
      const target = sector.baseTWh * Math.pow(1 + g, T);
      const mid = (sector.sMidYear ?? baseYear + T / 2) - baseYear;
      const k = 10 / T;
      const l0 = logistic(0, k, mid);
      const lT = logistic(T, k, mid);
      const f = lT === l0 ? t / T : (logistic(t, k, mid) - l0) / (lT - l0);
      value = sector.baseTWh + (target - sector.baseTWh) * f;
      break;
    }
  }
  const efficiency = Math.pow(1 - sector.efficiencyPct / 100, t);
  return Math.max(0, value * efficiency);
}

/** GW = TWh / (8.76 × load factor) */
export function peakFromEnergy(twh: number, loadFactor: number): number {
  return twh / (HOURS_PER_YEAR_K * loadFactor);
}

export function projectDemand(scenario: DemandScenario): DemandPoint[] {
  const out: DemandPoint[] = [];
  for (const year of yearRange(scenario.baseYear, scenario.horizonYear)) {
    for (const s of scenario.sectors) {
      const twh = sectorTWh(s, year, scenario.baseYear, scenario.horizonYear);
      out.push({ year, sector: s.key, twh, peakGW: peakFromEnergy(twh, s.loadFactor) });
    }
  }
  return out;
}

export interface DemandTotal {
  year: number;
  twh: number;
  /** סכום שיאי המגזרים: הנחה שמרנית שכל השיאים חופפים. */
  peakGW: number;
}

export function demandTotals(points: DemandPoint[]): DemandTotal[] {
  const byYear = new Map<number, DemandTotal>();
  for (const p of points) {
    const t = byYear.get(p.year) ?? { year: p.year, twh: 0, peakGW: 0 };
    t.twh += p.twh;
    t.peakGW += p.peakGW;
    byYear.set(p.year, t);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

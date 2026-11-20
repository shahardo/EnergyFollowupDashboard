import type { DemandScenario, SectorDemand, SubSector } from '../schema';
import { SECONDS_PER_YEAR } from './units';
import { yearRange } from './years';

/** הביקוש של מגזר אחד בשנה אחת: אנרגיה (J) ושיא (W). */
export interface DemandPoint {
  year: number;
  sector: string;
  energy: number;
  peak: number;
}

const logistic = (t: number, k: number, mid: number) => 1 / (1 + Math.exp(-k * (t - mid)));

/**
 * הביקוש לחשמל של מגזר אחד בשנה מסוימת (J).
 * - linear: צמיחה קבועה (שבר משנת הבסיס).
 * - exp: ריבית דריבית.
 * - s: עקומה לוגיסטית שמתחילה בערך הבסיס ומגיעה בשנת האופק לאותו ערך כמו exp,
 *   עם נקודת פיתול ב-sMidYear (ברירת מחדל: אמצע התקופה).
 * ההתייעלות מוחלת בסוף, כהפחתה מצטברת של efficiencyRate בכל שנה.
 */
export function sectorEnergy(sector: SectorDemand, year: number, baseYear: number, horizonYear: number): number {
  const t = Math.max(0, year - baseYear);
  const g = sector.growthRate;
  let value: number;
  switch (sector.curve) {
    case 'linear':
      value = sector.baseEnergy * (1 + g * t);
      break;
    case 'exp':
      value = sector.baseEnergy * Math.pow(1 + g, t);
      break;
    case 's': {
      const T = Math.max(1, horizonYear - baseYear);
      const target = sector.baseEnergy * Math.pow(1 + g, T);
      const mid = (sector.sMidYear ?? baseYear + T / 2) - baseYear;
      const k = 10 / T;
      const l0 = logistic(0, k, mid);
      const lT = logistic(T, k, mid);
      const f = lT === l0 ? t / T : (logistic(t, k, mid) - l0) / (lT - l0);
      value = sector.baseEnergy + (target - sector.baseEnergy) * f;
      break;
    }
  }
  const efficiency = Math.pow(1 - sector.efficiencyRate, t);
  return Math.max(0, value * efficiency);
}

/** חשמל של תת-מגזר בשנה (J): חלקו מבסיס המגזר, באותה עקומה, עם הצמיחה שלו (או של המגזר). */
export function subSectorEnergy(
  sector: SectorDemand,
  sub: SubSector,
  year: number,
  baseYear: number,
  horizonYear: number,
): number {
  const growthRate = sub.growthRate ?? sector.growthRate;
  return sectorEnergy({ ...sector, baseEnergy: sector.baseEnergy * sub.elecShare, growthRate }, year, baseYear, horizonYear);
}

/**
 * חשמל של מגזר בשנה (J): סכום תתי-המגזרים אם יש, אחרת לפי המגזר עצמו. כשתתי-המגזרים מכסים את כל הבסיס
 * (חלקים שסכומם 1) ובלי צמיחה משלהם, התוצאה שווה למגזר בלי פירוק.
 */
export function sectorTotalEnergy(sector: SectorDemand, year: number, baseYear: number, horizonYear: number): number {
  if (!sector.subSectors?.length) return sectorEnergy(sector, year, baseYear, horizonYear);
  return sector.subSectors.reduce((a, sub) => a + subSectorEnergy(sector, sub, year, baseYear, horizonYear), 0);
}

/** הביקוש של תת-מגזר אחד בשנה אחת. */
export interface SubSectorPoint {
  year: number;
  sector: string;
  subSector: string;
  energy: number;
  peak: number;
}

/** החשמל של כל תת-מגזר בכל שנה (לגרף המפורק ולמודל OSeMOSYS). */
export function projectSubSectors(scenario: DemandScenario): SubSectorPoint[] {
  const out: SubSectorPoint[] = [];
  for (const year of yearRange(scenario.baseYear, scenario.horizonYear)) {
    for (const s of scenario.sectors) {
      for (const sub of s.subSectors ?? []) {
        const energy = subSectorEnergy(s, sub, year, scenario.baseYear, scenario.horizonYear);
        out.push({ year, sector: s.key, subSector: sub.key, energy, peak: peakFromEnergy(energy, s.loadFactor) });
      }
    }
  }
  return out;
}

/** שיא (W) של אנרגיה שנתית (J) במקדם עומס: E / (שנה × load factor). */
export function peakFromEnergy(energy: number, loadFactor: number): number {
  return energy / (SECONDS_PER_YEAR * loadFactor);
}

/** הביקוש של כל מגזר בכל שנה, משנת הבסיס עד שנת האופק (J, ושיא לפי ה-load factor). */
export function projectDemand(scenario: DemandScenario): DemandPoint[] {
  const out: DemandPoint[] = [];
  for (const year of yearRange(scenario.baseYear, scenario.horizonYear)) {
    for (const s of scenario.sectors) {
      const energy = sectorTotalEnergy(s, year, scenario.baseYear, scenario.horizonYear);
      out.push({ year, sector: s.key, energy, peak: peakFromEnergy(energy, s.loadFactor) });
    }
  }
  return out;
}

/** סך הביקוש של שנה אחת. */
export interface DemandTotal {
  year: number;
  /** J */
  energy: number;
  /** סכום שיאי המגזרים (W): הנחה שמרנית שכל השיאים חופפים. */
  peak: number;
}

/** סוכם את המגזרים לסך שנתי, ממוין לפי שנה. */
export function demandTotals(points: DemandPoint[]): DemandTotal[] {
  const byYear = new Map<number, DemandTotal>();
  for (const p of points) {
    const t = byYear.get(p.year) ?? { year: p.year, energy: 0, peak: 0 };
    t.energy += p.energy;
    t.peak += p.peak;
    byYear.set(p.year, t);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

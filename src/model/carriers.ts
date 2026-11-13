import type { DemandScenario, ScenarioPlanParams, SectorDemand } from '../schema';
import type { DemandPoint } from './demand';
import type { SupplyPoint } from './supply';
import { linearShare } from './math';
import { applyMeasures, type MeasuredTotal } from './measures';

/** הביקוש שאינו חשמל של מגזר אחד בשנה אחת (TWh אנרגיה סופית, לפני התייעלות וחיסכון). */
export interface NonElectricPoint {
  year: number;
  sector: string;
  fuelsTWh: number;
  gasTWh: number;
}

/**
 * הביקוש שאינו חשמל של כל מגזר בכל שנה: ערך הבסיס בצמיחה שנתית (ריבית דריבית), ופחות הדלק שהחשמול
 * מחליף: electrifyOffset × (החשמל של המגזר בשנה − החשמל שלו בשנת הבסיס). לא יורד מאפס.
 * `demandPoints` הם הביקוש לחשמל לפי מגזר (projectDemand).
 */
export function projectNonElectric(demand: DemandScenario, demandPoints: DemandPoint[]): NonElectricPoint[] {
  const elec = new Map(demandPoints.map((p) => [`${p.sector}|${p.year}`, p.twh]));
  const out: NonElectricPoint[] = [];
  for (const s of demand.sectors) {
    const ne = s.nonElectric;
    if (!ne) continue;
    const e0 = elec.get(`${s.key}|${demand.baseYear}`) ?? 0;
    for (let year = demand.baseYear; year <= demand.horizonYear; year++) {
      const grow = Math.pow(1 + ne.growthPct / 100, year - demand.baseYear);
      const displaced = (ne.electrifyOffset ?? 0) * Math.max(0, (elec.get(`${s.key}|${year}`) ?? 0) - e0);
      out.push({ year, sector: s.key, fuelsTWh: Math.max(0, ne.fuelsTWh * grow - displaced), gasTWh: ne.gasTWh * grow });
    }
  }
  return out;
}

/** האם למגזר יש ביקוש שאינו חשמל. */
export const hasNonElectric = (s: SectorDemand): boolean =>
  !!s.nonElectric && (s.nonElectric.fuelsTWh > 0 || s.nonElectric.gasTWh > 0);

/** הביקוש שאינו חשמל בכל שנה, אחרי התייעלות וחיסכון (אותם אחוזים כמו בחשמל), לפי נשא: דלקים וגז ישיר. */
export interface NonElectricMeasured {
  fuels: MeasuredTotal[];
  gas: MeasuredTotal[];
}

/**
 * סוכם את הביקוש שאינו חשמל של המגזרים שעוברים את `include` ומפעיל עליו את ההפחתות של התרחיש.
 * השדות של השיא (peakGW) תמיד 0: לדלקים אין שיא חשמלי.
 */
export function measureNonElectric(
  demand: DemandScenario,
  points: NonElectricPoint[],
  years: number[],
  include: (sector: string) => boolean = () => true,
): NonElectricMeasured {
  const fuels = new Map<number, number>();
  const gas = new Map<number, number>();
  for (const p of points) {
    if (!include(p.sector)) continue;
    fuels.set(p.year, (fuels.get(p.year) ?? 0) + p.fuelsTWh);
    gas.set(p.year, (gas.get(p.year) ?? 0) + p.gasTWh);
  }
  const measure = (m: Map<number, number>) =>
    applyMeasures(
      years.map((year) => ({ year, twh: m.get(year) ?? 0, peakGW: 0 })),
      demand.measures,
      demand.baseYear,
      demand.horizonYear,
    );
  return { fuels: measure(fuels), gas: measure(gas) };
}

/** החלקים של ביקוש הדלקים בשנה: דלקים נקיים, מימן, והשאר פוסילי. סכומם 1. */
export interface FuelShares {
  importClean: number;
  hydrogenImport: number;
  importFossil: number;
}

/**
 * תמהיל הדלקים בשנה: הדלקים הנקיים והמימן עולים לינארית משנת ההתחלה שלהם (0) ועד sharePct בשנת האופק;
 * יבוא הדלקים הפוסיליים משלים. אם הנקיים והמימן עוברים יחד 100%, הם מוקטנים באותו יחס.
 */
export function fuelShares(year: number, params: ScenarioPlanParams, horizonYear: number): FuelShares {
  const part = ({ start, sharePct }: { start: number; sharePct: number }) =>
    year < start ? 0 : (sharePct / 100) * linearShare(year, start, horizonYear);
  let clean = part(params.cleanFuels);
  let hydrogen = part(params.hydrogen);
  const sum = clean + hydrogen;
  if (sum > 1) {
    clean /= sum;
    hydrogen /= sum;
  }
  return { importClean: clean, hydrogenImport: hydrogen, importFossil: Math.max(0, 1 - clean - hydrogen) };
}

/** מפתחות מקורות הדלק, מלמטה למעלה בערימה. */
export const FUEL_KEYS = ['importClean', 'hydrogenImport', 'importFossil'] as const;

/**
 * מקורות הדלק שמספקים ביקוש דלקים (נטו, TWh לכל שנה) לפי תמהיל השנה (fuelShares).
 * בצורה של SupplyPoint (gw ו-firmGW תמיד 0), כדי שגרף ההיצע ימיר אותם כמו כל מקור.
 */
export function fuelSupplyPoints(
  fuels: { year: number; twh: number }[],
  params: ScenarioPlanParams,
  horizonYear: number,
): SupplyPoint[] {
  return fuels.flatMap(({ year, twh }) => {
    const shares = fuelShares(year, params, horizonYear);
    return FUEL_KEYS.map((source) => ({ year, source, gw: 0, twh: twh * shares[source], firmGW: 0 }));
  });
}

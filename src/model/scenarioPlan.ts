import type { ScenarioPlanParams } from '../schema';
import type { DemandTotal } from './demand';
import { fuelSupplyPoints } from './carriers';
import { interpolateCapacity, energyTWh, type SupplyPoint } from './supply';
import { HOURS_PER_YEAR_K } from './years';

/** מקורות החשמל של תכנון התרחישים, מלמטה למעלה בערימה. הגז האחרון: הוא משלים את מה שנשאר. */
export const PLAN_ELECTRIC_KEYS = ['solar', 'solar30', 'solar40', 'importElectricity', 'geothermal', 'fusion', 'gas'] as const;
/** מקור חשמל בתכנון התרחישים. */
export type PlanElectricKey = (typeof PLAN_ELECTRIC_KEYS)[number];
/** מפתח הגז הטבעי בשימוש ישיר (לא לייצור חשמל). */
export const GAS_DIRECT_KEY = 'gasDirect';

/** מקדם הקיבולת (CF, לאנרגיה) וה-capacity credit (לשיא) של מקור חשמל. */
export interface PlanSourceMeta {
  capacityFactor: number;
  capacityCredit: number;
}

/** מעבר חלק 0 → 1 (smoothstep): ה"קשת" שבה מקור נכנס לפני שהוא מתייצב על קצב קבוע. */
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * הספק מותקן (GW) של מקור "קשת": משנת ההתחלה קצב הבנייה עולה בקשת חלקה לאורך rampYears שנים,
 * ואז נשאר rateGW בשנה. ההספק הוא סכום הבנייה עד השנה (כולל).
 */
export function rampCapacity(p: { start: number; rateGW: number; rampYears: number }, year: number): number {
  let gw = 0;
  for (let y = p.start; y <= year; y++) gw += p.rateGW * (p.rampYears > 0 ? smooth((y - p.start + 1) / p.rampYears) : 1);
  return gw;
}

/**
 * הספק מותקן (GW) של מקור חשמל (לא גז) בשנה, לפי כללי התכנון:
 * סולארי: הבסיס ועוד slopeGW בכל שנה; סולארי 30% / 40%: slopeGW בכל שנה משנת ההתחלה (כולל);
 * יבוא חשמל: stepGW בשנת ההתחלה ועוד stepGW כל stepYears (לינארי ביניהן), עד steps מדרגות;
 * גיאותרמיה והיתוך: קשת ואז קצב קבוע (rampCapacity).
 */
export function planCapacity(key: Exclude<PlanElectricKey, 'gas'>, p: ScenarioPlanParams, year: number, baseYear: number): number {
  switch (key) {
    case 'solar':
      return p.solar.baseGW + p.solar.slopeGW * Math.max(0, year - baseYear);
    case 'solar30':
    case 'solar40':
      return p[key].slopeGW * Math.max(0, year - p[key].start + 1);
    case 'importElectricity': {
      const { start, stepGW, stepYears, steps } = p.importElectricity;
      const anchors = [{ year: start - 1, gw: 0 }];
      for (let k = 0; k < steps; k++) anchors.push({ year: start + k * stepYears, gw: stepGW * (k + 1) });
      return interpolateCapacity(anchors, year);
    }
    case 'geothermal':
    case 'fusion':
      return rampCapacity(p[key], year);
  }
}

/** הביקוש שאינו חשמל (נטו) בשנה. */
export interface FuelDemand {
  year: number;
  fuelsTWh: number;
  gasTWh: number;
}

/** האספקה של תכנון התרחישים: מקורות החשמל (כולל הגז שמשלים) ומקורות הדלק והגז הישיר. */
export interface PlanSupply {
  /** מקורות החשמל, בצורה של model/supply.ts (מתאים להמרות היחידות של גרף ההיצע). */
  electric: SupplyPoint[];
  /** הדלקים (נקיים, מימן, פוסיליים) והגז הישיר: TWh אנרגיה סופית; gw ו-firmGW תמיד 0. */
  fuels: SupplyPoint[];
}

/**
 * בונה את האספקה לכל שנה: מקורות החשמל לפי הכללים (planCapacity), והגז הטבעי משלים את מה שנשאר:
 * באנרגיה (ביקוש נטו פחות הייצור של השאר) ובשיא (השיא פחות ההספק המובטח של השאר), כך שהביקוש לחשמל
 * תמיד מכוסה. הדלקים מתחלקים לפי fuelShares, והגז הישיר מסופק כולו בגז טבעי.
 */
export function planSupply(
  params: ScenarioPlanParams,
  meta: Record<PlanElectricKey, PlanSourceMeta>,
  years: number[],
  electric: DemandTotal[],
  fuels: FuelDemand[],
  baseYear: number,
  horizonYear: number,
): PlanSupply {
  const elecByYear = new Map(electric.map((t) => [t.year, t]));
  const fuelByYear = new Map(fuels.map((f) => [f.year, f]));
  const out: PlanSupply = { electric: [], fuels: [] };
  for (const year of years) {
    let twhSum = 0;
    let firmSum = 0;
    for (const key of PLAN_ELECTRIC_KEYS) {
      if (key === 'gas') continue;
      const { capacityFactor, capacityCredit } = meta[key];
      const gw = planCapacity(key, params, year, baseYear);
      const twh = energyTWh(gw, capacityFactor);
      const firmGW = gw * capacityCredit;
      twhSum += twh;
      firmSum += firmGW;
      out.electric.push({ year, source: key, gw, twh, firmGW });
    }
    const d = elecByYear.get(year) ?? { twh: 0, peakGW: 0 };
    const gas = meta.gas;
    const gasTWh = Math.max(0, d.twh - twhSum);
    const gasGW = Math.max(
      gasTWh / (Math.max(gas.capacityFactor, 1e-6) * HOURS_PER_YEAR_K),
      Math.max(0, d.peakGW - firmSum) / Math.max(gas.capacityCredit, 1e-6),
    );
    out.electric.push({ year, source: 'gas', gw: gasGW, twh: gasTWh, firmGW: gasGW * gas.capacityCredit });

    const f = fuelByYear.get(year) ?? { fuelsTWh: 0, gasTWh: 0 };
    out.fuels.push(...fuelSupplyPoints([{ year, twh: f.fuelsTWh }], params, horizonYear));
    out.fuels.push({ year, source: GAS_DIRECT_KEY, gw: 0, twh: f.gasTWh, firmGW: 0 });
  }
  return out;
}

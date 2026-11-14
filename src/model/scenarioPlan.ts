import type { CapacityPoint, ScenarioPlanParams, SupplyScenario } from '../schema';
import type { DemandTotal } from './demand';
import { fuelSupplyPoints } from './carriers';
import { roundUp2, round2 } from './math';
import { computeSupply, interpolateCapacity, type SupplyPoint } from './supply';
import { HOURS_PER_YEAR_K, yearRange } from './years';

/** מקורות החשמל שהכללים קובעים, מלמטה למעלה בערימה. */
export const PLAN_RULE_KEYS = ['solar', 'solar30', 'solar40', 'importElectricity', 'geothermal', 'fusion'] as const;
/** מקור חשמל שהכללים קובעים. */
export type PlanRuleKey = (typeof PLAN_RULE_KEYS)[number];
/** המקור שמשלים את מה שנשאר. */
export const GAS_KEY = 'gas';
/** מפתח הגז הטבעי בשימוש ישיר (לא לייצור חשמל). */
export const GAS_DIRECT_KEY = 'gasDirect';

/** האם קבוצת פרמטרים היא כלל של מקור חשמל (ולא תמהיל דלקים). */
export const isRuleKey = (key: string): key is PlanRuleKey => (PLAN_RULE_KEYS as readonly string[]).includes(key);

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
 * הספק מותקן (GW) של מקור חשמל בשנה, לפי כללי התכנון:
 * סולארי: הבסיס ועוד slopeGW בכל שנה; סולארי 30% / 40%: slopeGW בכל שנה משנת ההתחלה (כולל);
 * יבוא חשמל: stepGW בשנת ההתחלה ועוד stepGW כל stepYears (לינארי ביניהן), עד steps מדרגות;
 * גיאותרמיה והיתוך: קשת ואז קצב קבוע (rampCapacity).
 */
export function planCapacity(key: PlanRuleKey, p: ScenarioPlanParams, year: number, baseYear: number): number {
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

/** עקומת ההספק של מקור לפי הכלל שלו: נקודה לכל שנה, משנת הבסיס עד שנת האופק (מעוגל ל-0.01 GW). */
export function planCurve(key: PlanRuleKey, p: ScenarioPlanParams, baseYear: number, horizonYear: number): CapacityPoint[] {
  return yearRange(baseYear, horizonYear).map((year) => ({ year, gw: round2(planCapacity(key, p, year, baseYear)) }));
}

/** מחליף את העקומה של מקור אחד (ומפעיל אותו). */
const withCurve = (s: SupplyScenario, key: string, capacityGW: CapacityPoint[]): SupplyScenario => ({
  ...s,
  sources: s.sources.map((x) => (x.key === key ? { ...x, capacityGW, enabled: true } : x)),
});

/** תקרת ההספק של מקור בתרחיש (Infinity כשאין). */
const capOf = (s: SupplyScenario, key: string) => s.sources.find((x) => x.key === key)?.maxGW ?? Infinity;

/** עקומת הכלל של מקור בתרחיש, חסומה בתקרה שלו (maxGW). */
const ruleCurve = (s: SupplyScenario, key: PlanRuleKey, base: number, horizon: number): CapacityPoint[] => {
  const cap = capOf(s, key);
  return planCurve(key, s.planParams!, base, horizon).map((c) => ({ year: c.year, gw: Math.min(c.gw, cap) }));
};

/**
 * הגז הטבעי משלים את מה שכל שאר המקורות הפעילים משאירים, בכל שנה: באנרגיה ובשיא,
 * max(TWh חסר / (CF·8.76), שיא חסר / credit), מעוגל כלפי מעלה ל-0.01 GW.
 */
export function refillGas(scenario: SupplyScenario, totals: DemandTotal[]): SupplyScenario {
  const gas = scenario.sources.find((s) => s.key === GAS_KEY);
  if (!gas || totals.length === 0) return scenario;
  const years = totals.map((t) => t.year);
  const others = computeSupply({ ...scenario, sources: scenario.sources.filter((s) => s.key !== GAS_KEY) }, years);
  const byYear = new Map<number, { twh: number; firm: number }>();
  for (const p of others) {
    const v = byYear.get(p.year) ?? { twh: 0, firm: 0 };
    v.twh += p.twh;
    v.firm += p.firmGW;
    byYear.set(p.year, v);
  }
  const curve = totals.map((t) => {
    const o = byYear.get(t.year) ?? { twh: 0, firm: 0 };
    const gw = Math.max(
      Math.max(0, t.twh - o.twh) / (Math.max(gas.capacityFactor, 1e-6) * HOURS_PER_YEAR_K),
      Math.max(0, t.peakGW - o.firm) / Math.max(gas.capacityCredit, 1e-6),
    );
    return { year: t.year, gw: roundUp2(gw) };
  });
  return withCurve(scenario, GAS_KEY, curve);
}

/** שנות הבסיס והאופק של הביקוש. */
const span = (totals: DemandTotal[]) => ({ base: totals[0].year, horizon: totals[totals.length - 1].year });

/**
 * מחיל כלל של מקור אחד על תרחיש ההיצע: העקומה של המקור נכתבת מחדש לפי planParams (עד ה-maxGW שלו),
 * והגז ממלא מחדש.
 * שאר המקורות (גם כאלה שנערכו ידנית) לא משתנים.
 */
export function applyPlanRule(scenario: SupplyScenario, key: PlanRuleKey, totals: DemandTotal[]): SupplyScenario {
  if (!scenario.planParams || totals.length === 0) return scenario;
  const { base, horizon } = span(totals);
  return refillGas(withCurve(scenario, key, ruleCurve(scenario, key, base, horizon)), totals);
}

/** מחיל את כל הכללים (ששת מקורות החשמל) ואז ממלא בגז. משמש לבניית התרחישים המוכנים. */
export function applyPlanRules(scenario: SupplyScenario, totals: DemandTotal[]): SupplyScenario {
  if (!scenario.planParams || totals.length === 0) return scenario;
  const { base, horizon } = span(totals);
  let s = scenario;
  for (const key of PLAN_RULE_KEYS) s = withCurve(s, key, ruleCurve(scenario, key, base, horizon));
  return refillGas(s, totals);
}

/** האם העקומה של מקור עדיין שווה לכלל שלו (בסטייה של עד 0.01 GW), או שנערכה ידנית. */
export function ruleMatches(scenario: SupplyScenario, key: PlanRuleKey, baseYear: number, horizonYear: number): boolean {
  const src = scenario.sources.find((s) => s.key === key);
  if (!src || !scenario.planParams) return true;
  if (!src.enabled) return false;
  const cap = capOf(scenario, key);
  const rule = (y: number) => Math.min(cap, planCapacity(key, scenario.planParams!, y, baseYear));
  return yearRange(baseYear, horizonYear).every((y) => Math.abs(interpolateCapacity(src.capacityGW, y) - rule(y)) <= 0.011);
}

/** הביקוש שאינו חשמל (נטו) בשנה. */
export interface FuelDemand {
  year: number;
  fuelsTWh: number;
  gasTWh: number;
}

/** האספקה של טאב תכנון התרחישים: מקורות החשמל (לפי סדר הערימה) והדלקים והגז הישיר. */
export interface PlanSupply {
  /** מפתחות מקורות החשמל לפי סדר הערימה (מלמטה למעלה). */
  electricKeys: string[];
  /** מקורות החשמל, בצורה של model/supply.ts; twh ו-firmGW הם מה שמסופק בפועל (אחרי הקיצוץ). */
  electric: SupplyPoint[];
  /** הדלקים (נקיים, מימן, פוסיליים) והגז הישיר: TWh אנרגיה סופית; gw ו-firmGW תמיד 0. */
  fuels: SupplyPoint[];
}

/**
 * האספקה לגרף של טאב תכנון התרחישים, מתוך תרחיש ההיצע המשותף: מקורות הכללים מלמטה, אחריהם שאר המקורות
 * הפעילים, והגז אחרון. כל מקור מספק רק עד הביקוש שעוד לא מכוסה (באנרגיה ובשיא); העודף מקוצץ מלמעלה
 * ו-gw נשאר ההספק המותקן. הדלקים מתחלקים לפי planParams, והגז הישיר מסופק כולו בגז טבעי.
 */
export function planSupply(
  scenario: SupplyScenario,
  params: ScenarioPlanParams,
  years: number[],
  electric: DemandTotal[],
  fuels: FuelDemand[],
  horizonYear: number,
): PlanSupply {
  const enabled = scenario.sources.filter((s) => s.enabled);
  const rank = (k: string) => (isRuleKey(k) ? PLAN_RULE_KEYS.indexOf(k) : k === GAS_KEY ? 1000 : 100);
  const electricKeys = enabled
    .map((s, i) => ({ k: s.key, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map((x) => x.k);
  const raw = new Map(computeSupply(scenario, years).map((p) => [`${p.source}|${p.year}`, p]));
  const elecByYear = new Map(electric.map((t) => [t.year, t]));
  const fuelByYear = new Map(fuels.map((f) => [f.year, f]));
  const out: PlanSupply = { electricKeys, electric: [], fuels: [] };
  for (const year of years) {
    const d = elecByYear.get(year) ?? { twh: 0, peakGW: 0 };
    let twhLeft = d.twh;
    let peakLeft = d.peakGW;
    for (const key of electricKeys) {
      const p = raw.get(`${key}|${year}`) ?? { year, source: key, gw: 0, twh: 0, firmGW: 0 };
      const twh = Math.min(p.twh, Math.max(0, twhLeft));
      const firmGW = Math.min(p.firmGW, Math.max(0, peakLeft));
      twhLeft -= twh;
      peakLeft -= firmGW;
      out.electric.push({ year, source: key, gw: p.gw, twh, firmGW });
    }
    const f = fuelByYear.get(year) ?? { fuelsTWh: 0, gasTWh: 0 };
    out.fuels.push(...fuelSupplyPoints([{ year, twh: f.fuelsTWh }], params, horizonYear));
    out.fuels.push({ year, source: GAS_DIRECT_KEY, gw: 0, twh: f.gasTWh, firmGW: 0 });
  }
  return out;
}

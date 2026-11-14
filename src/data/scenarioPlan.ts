import { interpolateCapacity } from '../model/supply';
import { SupplyFileSchema, type ScenarioPlanParams, type SupplyPreset } from '../schema';
import policyDeclared from './policies/supply-declared.json';

const BASE_YEAR = 2025;
const templateSolar = SupplyFileSchema.parse(policyDeclared).data.sources.find((s) => s.key === 'solar');
/** הסולארי המותקן בשנת הבסיס, מתבנית המדיניות (לא מהתרחישים שנבנים ממנה). */
const solarBaseGW = templateSolar ? interpolateCapacity(templateSolar.capacityGW, BASE_YEAR) : 5.7;

/**
 * כללי תכנון התרחישים לכל מדיניות היצע (ערכי דוגמה): ייחוס = מעט מתחדשות ויבוא מאוחר, מוצהרת = ברירת המחדל,
 * נבחנת = מתחדשות ודלקים נקיים מהר יותר. הגיאותרמיה נכנסת לאט (קשת של 10 שנים).
 * תשעת תרחישי ההיצע המוכנים נבנים מהכללים האלה (scripts/fit-supply-presets.ts).
 */
export const planPresets: Record<SupplyPreset, ScenarioPlanParams> = {
  reference: {
    solar: { baseGW: solarBaseGW, slopeGW: 0.7 },
    solar30: { start: 2032, slopeGW: 0.3 },
    solar40: { start: 2040, slopeGW: 0.2 },
    importElectricity: { start: 2035, stepGW: 0.5, stepYears: 5, steps: 4 },
    geothermal: { start: 2040, rateGW: 0.05, rampYears: 10 },
    fusion: { start: 2045, rateGW: 0.2, rampYears: 5 },
    cleanFuels: { start: 2030, sharePct: 5 },
    hydrogen: { start: 2040, sharePct: 0 },
  },
  declared: {
    solar: { baseGW: solarBaseGW, slopeGW: 1 },
    solar30: { start: 2030, slopeGW: 0.5 },
    solar40: { start: 2035, slopeGW: 0.5 },
    importElectricity: { start: 2030, stepGW: 1, stepYears: 5, steps: 4 },
    geothermal: { start: 2035, rateGW: 0.2, rampYears: 10 },
    fusion: { start: 2040, rateGW: 0.5, rampYears: 5 },
    cleanFuels: { start: 2030, sharePct: 20 },
    hydrogen: { start: 2040, sharePct: 10 },
  },
  tested: {
    solar: { baseGW: solarBaseGW, slopeGW: 1.5 },
    solar30: { start: 2030, slopeGW: 0.8 },
    solar40: { start: 2033, slopeGW: 0.8 },
    importElectricity: { start: 2030, stepGW: 1, stepYears: 5, steps: 4 },
    geothermal: { start: 2035, rateGW: 0.3, rampYears: 10 },
    fusion: { start: 2040, rateGW: 0.5, rampYears: 5 },
    cleanFuels: { start: 2030, sharePct: 40 },
    hydrogen: { start: 2040, sharePct: 20 },
  },
};

/** ערכי ברירת המחדל (המדיניות המוצהרת). */
export const defaultPlanParams: ScenarioPlanParams = planPresets.declared;

/** כללי התכנון של תרחיש היצע: שלו, או (בתרחיש ישן בלעדיהם) של המדיניות שלו. */
export const planParamsOf = (s: { planParams?: ScenarioPlanParams; preset?: SupplyPreset }): ScenarioPlanParams =>
  s.planParams ?? planPresets[s.preset ?? 'declared'];

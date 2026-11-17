import { interpolateCapacity } from '../model/supply';
import {
  ScenarioPlanParamsSchema,
  SupplyFileSchema,
  SupplyPresetSchema,
  type ScenarioPlanParams,
  type SupplyPreset,
} from '../schema';
import presetsJson from './planPresets.json';
import policyDeclared from './policies/supply-declared.json';

const BASE_YEAR = 2025;
const templateSolar = SupplyFileSchema.parse(policyDeclared).data.sources.find((s) => s.key === 'solar');
/** הסולארי המותקן בשנת הבסיס, מתבנית המדיניות (לא מהתרחישים שנבנים ממנה). */
const solarBaseGW = templateSolar ? interpolateCapacity(templateSolar.capacityGW, BASE_YEAR) : 5.7;

/**
 * כללי תכנון התרחישים לכל מדיניות היצע (ערכי דוגמה, planPresets.json): ייחוס = מעט מתחדשות ויבוא מאוחר,
 * מוצהרת = ברירת המחדל, נבחנת = מתחדשות ודלקים נקיים מהר יותר. הגיאותרמיה נכנסת לאט (קשת של 10 שנים).
 * הסולארי בשנת הבסיס מגיע מתבנית המדיניות. תשעת תרחישי ההיצע המוכנים נבנים מהכללים האלה
 * (scripts/fit-supply-presets.ts), וגם השרת קורא את אותו קובץ.
 */
export const planPresets = Object.fromEntries(
  SupplyPresetSchema.options.map((p) => {
    const { solar, ...rest } = presetsJson[p];
    return [p, ScenarioPlanParamsSchema.parse({ ...rest, solar: { baseGW: solarBaseGW, slopeGW: solar.slopeGW } })];
  }),
) as Record<SupplyPreset, ScenarioPlanParams>;

/** ערכי ברירת המחדל (המדיניות המוצהרת). */
export const defaultPlanParams: ScenarioPlanParams = planPresets.declared;

/** כללי התכנון של תרחיש היצע: שלו, או (בתרחיש ישן בלעדיהם) של המדיניות שלו. */
export const planParamsOf = (s: { planParams?: ScenarioPlanParams; preset?: SupplyPreset }): ScenarioPlanParams =>
  s.planParams ?? planPresets[s.preset ?? 'declared'];

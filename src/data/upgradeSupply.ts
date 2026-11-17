import type { SupplyScenario, SupplySource } from '../schema';
import { baselineSupply } from './baseline';
import { mergeByBaseline } from './mergeByBaseline';

const LEGACY_IMPORT = 'import';
const SPLIT_IMPORT = ['importElectricity', 'importFossil', 'importClean'];

/** השדות הכלכליים והטכניים של מקור (חדשים ב-v2), שמקור בלי ערך מקבל מהבסיס. */
const ECONOMIC_FIELDS = [
  'capitalCost',
  'fixedCost',
  'variableCost',
  'operatingLife',
  'efficiency',
  'inputFuel',
  'emissionFactor',
  'earliestYear',
  'profile',
] as const;

/** משלים למקור את השדות הכלכליים שחסרים לו מהמקור באותו מפתח בבסיס; מקור שלא חסר לו כלום חוזר כמו שהוא. */
function withEconomics(s: SupplySource, base: SupplySource | undefined): SupplySource {
  if (!base) return s;
  const missing = ECONOMIC_FIELDS.filter((f) => s[f] === undefined && base[f] !== undefined);
  if (missing.length === 0) return s;
  return { ...s, ...Object.fromEntries(missing.map((f) => [f, base[f]])) };
}

/**
 * מעדכן תרחיש אספקה מגרסה קודמת לרשימת המקורות הנוכחית:
 * "יבוא" הישן הופך ל"יבוא חשמל" (עם הערכים שלו), ומקורות שחסרים בתרחיש נוספים
 * בערכי הבסיס שלהם (למשל סולארי 30% / 40%), מקור בלי הנתונים הכלכליים (קובץ v1) מקבל את של הבסיס,
 * ותרחיש בלי planParams מקבל את כללי התכנון של הבסיס. הסדר הוא סדר הבסיס; מקורות שלא מוכרים לבסיס נשארים בסוף.
 * `base` הוא התרחיש המוכן שממנו משלימים (ברירת המחדל: מדיניות מוצהרת).
 * תרחיש שכבר מעודכן חוזר כמו שהוא.
 */
export function upgradeSupply(scenario: SupplyScenario, base: SupplyScenario = baselineSupply): SupplyScenario {
  let sources = scenario.sources;
  let fillPriority = scenario.fillPriority;
  const has = (k: string) => sources.some((s) => s.key === k);

  if (has(LEGACY_IMPORT) && !SPLIT_IMPORT.some(has)) {
    const label = base.sources.find((s) => s.key === 'importElectricity')?.label ?? 'importElectricity';
    sources = sources.map((s) => (s.key === LEGACY_IMPORT ? { ...s, key: 'importElectricity', label } : s));
    fillPriority = fillPriority.map((k) => (k === LEGACY_IMPORT ? 'importElectricity' : k));
  }

  const byKey = new Map(base.sources.map((s) => [s.key, s]));
  const filled = sources.map((s) => withEconomics(s, byKey.get(s.key)));
  if (filled.some((s, i) => s !== sources[i])) sources = filled;
  const merged = mergeByBaseline(sources, base.sources);
  const needParams = scenario.planParams === undefined && base.planParams !== undefined;
  if (merged === scenario.sources && !needParams) return scenario;
  return {
    ...scenario,
    sources: merged,
    fillPriority,
    ...(needParams ? { planParams: structuredClone(base.planParams!) } : {}),
  };
}

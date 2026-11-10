import type { SupplyScenario } from '../schema';
import { baselineSupply } from './baseline';

const LEGACY_IMPORT = 'import';
const SPLIT_IMPORT = ['importElectricity', 'importFossil', 'importClean'];

/**
 * מעדכן תרחיש אספקה מגרסה קודמת לרשימת המקורות הנוכחית:
 * "יבוא" הישן הופך ל"יבוא חשמל" (עם הערכים שלו), ומקורות שחסרים בתרחיש נוספים
 * בערכי הבסיס שלהם. הסדר הוא סדר הבסיס; מקורות שלא מוכרים לבסיס נשארים בסוף.
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

  const missing = base.sources.filter((b) => !has(b.key));
  if (missing.length === 0 && sources === scenario.sources) return scenario;

  const all = [...sources, ...structuredClone(missing)];
  const rank = (k: string) => {
    const i = base.sources.findIndex((b) => b.key === k);
    return i < 0 ? Infinity : i;
  };
  const ordered = all
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i)
    .map((x) => x.s);
  return { ...scenario, sources: ordered, fillPriority };
}

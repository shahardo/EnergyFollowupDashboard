import type { DemandScenario, SectorDemand } from '../schema';
import { baselineDemand } from './baseline';
import { mergeByBaseline } from './mergeByBaseline';

/** תוויות ישנות של מגזרים שהוחלפו בתווית הבסיס. */
const LEGACY_LABELS: Record<string, string[]> = { transport: ['תחבורה (חשמול)', 'תחבורה (חשמל)'] };

/** מגזר מגרסה קודמת: תווית ישנה מוחלפת, וביקוש שאינו חשמל (אם חסר) מגיע מהבסיס. */
function upgradeSector(s: SectorDemand, base: SectorDemand | undefined): SectorDemand {
  if (!base) return s;
  const relabel = LEGACY_LABELS[s.key]?.includes(s.label) && s.label !== base.label;
  const addNonElectric = s.nonElectric === undefined && base.nonElectric !== undefined;
  if (!relabel && !addNonElectric) return s;
  return {
    ...s,
    ...(relabel ? { label: base.label } : {}),
    ...(addNonElectric ? { nonElectric: { ...base.nonElectric! } } : {}),
  };
}

/**
 * מעדכן תרחיש ביקוש מגרסה קודמת: מגזרים שחסרים (למשל "רשות פלסטינית") נוספים בערכי הבסיס,
 * וסדר המגזרים הוא סדר הבסיס (מגזרים שלא מוכרים לבסיס נשארים בסוף).
 * תרחיש בלי measures מקבל את ההתייעלות והחיסכון של הבסיס; תרחיש עם ערכים מפורשים שומר אותם.
 * מגזר בלי nonElectric מקבל את של הבסיס, ותווית ישנה ("תחבורה (חשמול)") מוחלפת בתווית הבסיס.
 * `base` הוא התרחיש המוכן שממנו משלימים (ברירת המחדל: ביקוש בינוני).
 * תרחיש שכבר מעודכן חוזר כמו שהוא.
 */
export function upgradeDemand(scenario: DemandScenario, base: DemandScenario = baselineDemand): DemandScenario {
  const merged = mergeByBaseline(scenario.sectors, base.sectors);
  const byKey = new Map(base.sectors.map((s) => [s.key, s]));
  const upgraded = merged.map((s) => upgradeSector(s, byKey.get(s.key)));
  const sectors = upgraded.every((s, i) => s === merged[i]) ? merged : upgraded;
  const needMeasures = scenario.measures === undefined && base.measures !== undefined;
  if (sectors === scenario.sectors && !needMeasures) return scenario;
  return {
    ...scenario,
    sectors,
    ...(needMeasures ? { measures: { ...base.measures! } } : {}),
  };
}

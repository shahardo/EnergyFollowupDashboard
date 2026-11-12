import type { DemandScenario } from '../schema';
import { baselineDemand } from './baseline';
import { mergeByBaseline } from './mergeByBaseline';

/**
 * מעדכן תרחיש ביקוש מגרסה קודמת: מגזרים שחסרים (למשל "רשות פלסטינית") נוספים בערכי הבסיס,
 * וסדר המגזרים הוא סדר הבסיס (מגזרים שלא מוכרים לבסיס נשארים בסוף).
 * תרחיש בלי measures מקבל את ההתייעלות והחיסכון של הבסיס; תרחיש עם ערכים מפורשים שומר אותם.
 * `base` הוא התרחיש המוכן שממנו משלימים (ברירת המחדל: ביקוש בינוני).
 * תרחיש שכבר מעודכן חוזר כמו שהוא.
 */
export function upgradeDemand(scenario: DemandScenario, base: DemandScenario = baselineDemand): DemandScenario {
  const sectors = mergeByBaseline(scenario.sectors, base.sectors);
  const needMeasures = scenario.measures === undefined && base.measures !== undefined;
  if (sectors === scenario.sectors && !needMeasures) return scenario;
  return {
    ...scenario,
    sectors,
    ...(needMeasures ? { measures: { ...base.measures! } } : {}),
  };
}

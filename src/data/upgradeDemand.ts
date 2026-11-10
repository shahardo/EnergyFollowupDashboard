import type { DemandScenario } from '../schema';
import { baselineDemand } from './baseline';

/**
 * מעדכן תרחיש ביקוש מגרסה קודמת: מגזרים שחסרים (למשל "רשות פלסטינית") נוספים בערכי הבסיס,
 * וסדר המגזרים הוא סדר הבסיס (מגזרים שלא מוכרים לבסיס נשארים בסוף).
 * תרחיש בלי measures מקבל את ההתייעלות והחיסכון של הבסיס; תרחיש עם ערכים מפורשים שומר אותם.
 * תרחיש שכבר מעודכן חוזר כמו שהוא.
 */
export function upgradeDemand(scenario: DemandScenario): DemandScenario {
  const has = (k: string) => scenario.sectors.some((s) => s.key === k);
  const missing = baselineDemand.sectors.filter((b) => !has(b.key));
  const needMeasures = scenario.measures === undefined && baselineDemand.measures !== undefined;
  if (missing.length === 0 && !needMeasures) return scenario;

  const rank = (k: string) => {
    const i = baselineDemand.sectors.findIndex((b) => b.key === k);
    return i < 0 ? Infinity : i;
  };
  const sectors = [...scenario.sectors, ...structuredClone(missing)]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i)
    .map((x) => x.s);
  return {
    ...scenario,
    sectors,
    ...(needMeasures ? { measures: { ...baselineDemand.measures! } } : {}),
  };
}

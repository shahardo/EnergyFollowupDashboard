/**
 * משלים רשימה (מגזרים או מקורות) מרשימת בסיס: פריטים שחסרים נוספים כעותק מהבסיס, והסדר הוא סדר הבסיס
 * (מיון יציב; פריטים שלא מוכרים לבסיס נשארים בסוף, בסדר המקורי).
 * כשאין מה להשלים, מחזיר את הרשימה המקורית כמו שהיא.
 */
export function mergeByBaseline<T extends { key: string }>(items: T[], baseline: readonly T[]): T[] {
  const have = new Set(items.map((x) => x.key));
  const missing = baseline.filter((b) => !have.has(b.key));
  if (missing.length === 0) return items;
  const rank = new Map(baseline.map((b, i) => [b.key, i]));
  const at = (k: string) => rank.get(k) ?? Infinity;
  return [...items, ...structuredClone(missing)]
    .map((x, i) => ({ x, i }))
    .sort((a, b) => at(a.x.key) - at(b.x.key) || a.i - b.i)
    .map(({ x }) => x);
}

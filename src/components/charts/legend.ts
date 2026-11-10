/** מקרא הגרפים: שתי שורות מתחת לגרף, בלי חיצי גלילה. */

/** מחלק את פריטי המקרא לשתי שורות: החצי הראשון (מעוגל למעלה) בשורה העליונה. */
export function splitLegend<T>(items: readonly T[]): [T[], T[]] {
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
}

/**
 * רוחב הטקסט המרבי שבו שורת מקרא נכנסת ברוחב הזמין.
 * `widths` הם רוחבי הטקסטים, `overhead` הוא מה שכל פריט מוסיף (סמל ורווחים).
 * מחזיר null אם השורה נכנסת בלי לקצר; אחרת תקרה אחידה, כך שרק הטקסטים הארוכים מקוצרים.
 */
export function legendTextCap(widths: readonly number[], available: number, overhead: number): number | null {
  const room = available - overhead * widths.length;
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= room) return null;
  if (room <= 0) return 0;
  // מילוי מים: הטקסטים הקצרים נשארים שלמים, והשאר מתחלקים בשווה ברוחב שנותר.
  const sorted = [...widths].sort((a, b) => a - b);
  let left = room;
  for (let i = 0; i < sorted.length; i++) {
    const cap = left / (sorted.length - i);
    if (sorted[i] >= cap) return Math.floor(cap);
    left -= sorted[i];
  }
  return Math.floor(sorted[sorted.length - 1]);
}

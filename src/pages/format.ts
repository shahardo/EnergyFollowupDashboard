export const fmt = (v: number, digits = 1) =>
  v.toLocaleString('he-IL', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
/** אחוז שלם; ערך מתחת ל-100 שהיה מתעגל ל-100 מוצג עם ספרה אחת, כדי שכיסוי חסר לא ייראה מלא. */
export const fmtPct = (v: number) => `${fmt(v, v < 100 && v >= 99.5 ? 1 : 0)}%`;

/** עיצוב מספרים, תאריכים וטקסט לתצוגה. */

/** מספר בעיצוב עברי, עם עד `digits` ספרות אחרי הנקודה (בלי אפסים מיותרים). */
export const fmt = (v: number, digits = 1) =>
  v.toLocaleString('he-IL', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** אחוז שלם; ערך מתחת ל-100 שהיה מתעגל ל-100 מוצג עם ספרה אחת, כדי שכיסוי חסר לא ייראה מלא. */
export const fmtPct = (v: number) => `${fmt(v, v < 100 && v >= 99.5 ? 1 : 0)}%`;

/** קטע משמאל לימין (בידוד LTR, U+2066…U+2069) בתוך טקסט עברי, כדי שיחידה לא תקפוץ לפני המספר. */
export const ltr = (text: string) => `⁦${text}⁩`;

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** מנטרל HTML בטקסט שמגיע מהמשתמש או מקובץ, לפני שמכניסים אותו ל-HTML (למשל טולטיפ של ECharts). */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

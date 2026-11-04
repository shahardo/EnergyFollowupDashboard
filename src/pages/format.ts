export const fmt = (v: number, digits = 1) =>
  v.toLocaleString('he-IL', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
export const fmtPct = (v: number) => `${fmt(v, 0)}%`;

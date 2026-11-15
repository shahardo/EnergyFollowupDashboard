import { createContext, createElement, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';

/** הערך הגבוה של גרף אחד, לפי היחידה שלו. */
interface Entry {
  unit: string;
  max: number;
}

interface Ctx {
  entries: Record<string, Entry>;
  report: (id: string, entry: Entry | null) => void;
}

const SharedScaleContext = createContext<Ctx | null>(null);

/**
 * עוטף כמה גרפים (למשל ביקוש והיצע זה לצד זה) כך שגרפים באותה יחידה יקבלו אותו ראש לציר ה-Y.
 * כל גרף מדווח את הערך הגבוה שלו; גרף ביחידה אחרת (למשל BCM מול שעט"ן) נשאר בסקאלה שלו.
 */
export function SharedScaleProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const report = useCallback((id: string, entry: Entry | null) => {
    setEntries((prev) => {
      const old = prev[id];
      if (entry === null) {
        if (!old) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (old && old.unit === entry.unit && old.max === entry.max) return prev;
      return { ...prev, [id]: entry };
    });
  }, []);
  const value = useMemo(() => ({ entries, report }), [entries, report]);
  return createElement(SharedScaleContext.Provider, { value }, children);
}

/**
 * הערך הגבוה המשותף לגרפים באותה יחידה (כולל הגרף הזה), או null מחוץ ל-SharedScaleProvider.
 */
export function useSharedScale(unit: string, ownMax: number): number | null {
  const ctx = useContext(SharedScaleContext);
  const id = useId();
  const report = ctx?.report;
  useEffect(() => {
    report?.(id, { unit, max: ownMax });
  }, [report, id, unit, ownMax]);
  useEffect(() => () => report?.(id, null), [report, id]);
  if (!ctx) return null;
  let max = ownMax;
  for (const [k, e] of Object.entries(ctx.entries)) if (k !== id && e.unit === unit) max = Math.max(max, e.max);
  return max;
}

import { useMemo } from 'react';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultMaxPower, defaultStartYears, defaultWeights, scoreFor } from '../data/trilemma';
import { migrateScoreV1 } from '../io/migrateV1';
import { PRIORITY_AXES, type PriorityAxis, type PriorityWeights, type StartYearRange } from '../model/priority';
import { fromGW, fromPct } from '../model/units';
import { TrilemmaScoreSchema, type TrilemmaScore } from '../schema';
import { safeJSONStorage } from './safeStorage';

/** שנות ההשבתה המוקדמת שאפשר לבחור. */
export const RETIRE_YEARS = [2030, 2035, 2040, 2045, 2050] as const;

/** ברירות המחדל של הפרמטרים (מלבד המשקלות). */
export const PRIORITY_DEFAULTS = { minFeasibility: 0.2, retireBelow: 5, retireByYear: 2040 };

/** הפרמטרים של כלי התעדוף. */
type PriorityOptions = typeof PRIORITY_DEFAULTS;

/** מצב כלי התעדוף, וציוני הטרילמה שנערכו (משותפים גם לטאבי הטרילמה והפירמידה). */
interface PriorityState extends PriorityOptions {
  weights: PriorityWeights;
  /** ציונים שנערכו, לפי מפתח ערוץ. ערוץ שלא נערך מקבל את ערכי הדוגמה (scoreFor). */
  scores: Record<string, TrilemmaScore>;
  /** תקרות שנערכו (W, null = בלי תקרה). ערוץ שלא נערך מקבל את defaultMaxPower. */
  maxPower: Record<string, number | null>;
  /** טווחי שנות התחלה שנערכו (null = בלי מגבלה). ערוץ שלא נערך מקבל את defaultStartYears. */
  startYears: Record<string, StartYearRange | null>;
  setWeight: (axis: PriorityAxis, v: number) => void;
  setWeights: (w: PriorityWeights) => void;
  setOptions: (patch: Partial<PriorityOptions>) => void;
  setScore: (key: string, patch: Partial<TrilemmaScore>) => void;
  setMaxPower: (key: string, power: number | null) => void;
  setStartYears: (key: string, range: StartYearRange | null) => void;
  /** מחזיר את ציוני הדוגמה, התקרות ושנות ההתחלה המקוריות. */
  resetScores: () => void;
}

const WeightsSchema = z.object(
  Object.fromEntries(PRIORITY_AXES.map((a) => [a, z.number().min(0).max(100)])) as Record<PriorityAxis, z.ZodNumber>,
);
const PersistedSchema = z
  .object({
    weights: WeightsSchema,
    scores: z.record(TrilemmaScoreSchema),
    maxPower: z.record(z.number().nonnegative().nullable()),
    startYears: z.record(z.object({ earliest: z.number().int(), realistic: z.number().int() }).nullable()),
    minFeasibility: z.number().min(0).max(1),
    retireBelow: z.number().min(0).max(10),
    retireByYear: z.number().int(),
  })
  .partial();

/** מצב שנשמר בגרסה 1 (אחוזים, GW) → גרסה 2 (שברים, W). שדה לא תקין נשאר כמו שהוא ונפסל ב-merge. */
function migratePriorityV1(persisted: unknown): unknown {
  const p = (persisted ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...p };
  delete out.maxGW;
  delete out.minFeasibilityPct;
  if (typeof p.minFeasibilityPct === 'number') out.minFeasibility = fromPct(p.minFeasibilityPct);
  if (p.maxGW && typeof p.maxGW === 'object') {
    out.maxPower = Object.fromEntries(
      Object.entries(p.maxGW as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'number' ? fromGW(v) : v]),
    );
  }
  if (p.scores && typeof p.scores === 'object') {
    out.scores = Object.fromEntries(
      Object.entries(p.scores as Record<string, { feasibilityPct?: number }>).map(([k, v]) => [
        k,
        v && typeof v.feasibilityPct === 'number' ? migrateScoreV1(v as never) : v,
      ]),
    );
  }
  return out;
}

/** חנות כלי התעדוף (נשמרת ב-localStorage; מצב לא תקין מוחלף בברירות המחדל, שדה אחר שדה). */
export const usePriorityStore = create<PriorityState>()(
  persist(
    (set) => ({
      ...PRIORITY_DEFAULTS,
      weights: defaultWeights,
      scores: {},
      maxPower: {},
      startYears: {},
      setWeight: (axis, v) => set((st) => ({ weights: { ...st.weights, [axis]: v } })),
      setWeights: (weights) => set({ weights }),
      setOptions: (patch) => set(patch),
      setScore: (key, patch) =>
        set((st) => ({ scores: { ...st.scores, [key]: { ...(st.scores[key] ?? scoreFor(key)), ...patch } } })),
      setMaxPower: (key, power) => set((st) => ({ maxPower: { ...st.maxPower, [key]: power } })),
      setStartYears: (key, range) => set((st) => ({ startYears: { ...st.startYears, [key]: range } })),
      resetScores: () => set({ scores: {}, maxPower: {}, startYears: {} }),
    }),
    {
      name: 'energy-dashboard/priority',
      storage: safeJSONStorage,
      // גרסה 2: יחידות SI (יישימות כשבר, תקרות ב-W). מצב מגרסה 1 מומר.
      version: 2,
      migrate: (persisted, version) => (version >= 2 ? persisted : migratePriorityV1(persisted)),
      partialize: (st) => ({
        weights: st.weights,
        scores: st.scores,
        maxPower: st.maxPower,
        startYears: st.startYears,
        minFeasibility: st.minFeasibility,
        retireBelow: st.retireBelow,
        retireByYear: st.retireByYear,
      }),
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted ?? {});
        if (!parsed.success) return current;
        const p = parsed.data;
        return {
          ...current,
          ...p,
          ...(p.retireByYear !== undefined && !(RETIRE_YEARS as readonly number[]).includes(p.retireByYear)
            ? { retireByYear: current.retireByYear }
            : {}),
        };
      },
    },
  ),
);

/** פונקציית הציון של ערוץ: הציון שנערך, או ערכי הדוגמה. */
export const scoreFrom =
  (scores: Record<string, TrilemmaScore>) =>
  (key: string): TrilemmaScore =>
    scores[key] ?? scoreFor(key);

/** התקרות בפועל (W): מה שנערך, ואחרת defaultMaxPower. */
export const maxPowerFrom = (edited: Record<string, number | null>): Record<string, number | null> => ({
  ...defaultMaxPower,
  ...edited,
});

/** פונקציית הציון לפי הציונים שבחנות (יציבה כל עוד הציונים לא השתנו). */
export function useScoreOf(): (key: string) => TrilemmaScore {
  const scores = usePriorityStore((s) => s.scores);
  return useMemo(() => scoreFrom(scores), [scores]);
}

/** טווחי שנות ההתחלה בפועל: defaultStartYears עם מה שנערך (null מוחק את המגבלה). */
export function startYearsFrom(edited: Record<string, StartYearRange | null>): Record<string, StartYearRange> {
  const out: Record<string, StartYearRange> = { ...defaultStartYears };
  for (const [k, v] of Object.entries(edited)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

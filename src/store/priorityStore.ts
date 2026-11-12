import { useMemo } from 'react';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultMaxGW, defaultWeights, scoreFor } from '../data/trilemma';
import { PRIORITY_AXES, type PriorityAxis, type PriorityWeights } from '../model/priority';
import { TrilemmaScoreSchema, type TrilemmaScore } from '../schema';
import { safeJSONStorage } from './safeStorage';

/** שנות ההשבתה המוקדמת שאפשר לבחור. */
export const RETIRE_YEARS = [2030, 2035, 2040, 2045, 2050] as const;

/** ברירות המחדל של הפרמטרים (מלבד המשקלות). */
export const PRIORITY_DEFAULTS = { minFeasibilityPct: 20, retireBelow: 5, retireByYear: 2040 };

/** הפרמטרים של כלי התעדוף. */
type PriorityOptions = typeof PRIORITY_DEFAULTS;

/** מצב כלי התעדוף, וציוני הטרילמה שנערכו (משותפים גם לטאבי הטרילמה והפירמידה). */
interface PriorityState extends PriorityOptions {
  weights: PriorityWeights;
  /** ציונים שנערכו, לפי מפתח ערוץ. ערוץ שלא נערך מקבל את ערכי הדוגמה (scoreFor). */
  scores: Record<string, TrilemmaScore>;
  /** תקרות שנערכו (GW, null = בלי תקרה). ערוץ שלא נערך מקבל את defaultMaxGW. */
  maxGW: Record<string, number | null>;
  setWeight: (axis: PriorityAxis, v: number) => void;
  setWeights: (w: PriorityWeights) => void;
  setOptions: (patch: Partial<PriorityOptions>) => void;
  setScore: (key: string, patch: Partial<TrilemmaScore>) => void;
  setMaxGW: (key: string, gw: number | null) => void;
  /** מחזיר את ציוני הדוגמה ואת התקרות המקוריות. */
  resetScores: () => void;
}

const WeightsSchema = z.object(
  Object.fromEntries(PRIORITY_AXES.map((a) => [a, z.number().min(0).max(100)])) as Record<PriorityAxis, z.ZodNumber>,
);
const PersistedSchema = z
  .object({
    weights: WeightsSchema,
    scores: z.record(TrilemmaScoreSchema),
    maxGW: z.record(z.number().nonnegative().nullable()),
    minFeasibilityPct: z.number().min(0).max(100),
    retireBelow: z.number().min(0).max(10),
    retireByYear: z.number().int(),
  })
  .partial();

/** חנות כלי התעדוף (נשמרת ב-localStorage; מצב לא תקין מוחלף בברירות המחדל, שדה אחר שדה). */
export const usePriorityStore = create<PriorityState>()(
  persist(
    (set) => ({
      ...PRIORITY_DEFAULTS,
      weights: defaultWeights,
      scores: {},
      maxGW: {},
      setWeight: (axis, v) => set((st) => ({ weights: { ...st.weights, [axis]: v } })),
      setWeights: (weights) => set({ weights }),
      setOptions: (patch) => set(patch),
      setScore: (key, patch) =>
        set((st) => ({ scores: { ...st.scores, [key]: { ...(st.scores[key] ?? scoreFor(key)), ...patch } } })),
      setMaxGW: (key, gw) => set((st) => ({ maxGW: { ...st.maxGW, [key]: gw } })),
      resetScores: () => set({ scores: {}, maxGW: {} }),
    }),
    {
      name: 'energy-dashboard/priority',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({
        weights: st.weights,
        scores: st.scores,
        maxGW: st.maxGW,
        minFeasibilityPct: st.minFeasibilityPct,
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

/** התקרות בפועל: מה שנערך, ואחרת defaultMaxGW. */
export const maxGWFrom = (edited: Record<string, number | null>): Record<string, number | null> => ({
  ...defaultMaxGW,
  ...edited,
});

/** פונקציית הציון לפי הציונים שבחנות (יציבה כל עוד הציונים לא השתנו). */
export function useScoreOf(): (key: string) => TrilemmaScore {
  const scores = usePriorityStore((s) => s.scores);
  return useMemo(() => scoreFrom(scores), [scores]);
}

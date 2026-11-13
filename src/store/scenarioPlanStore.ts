import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultPlanParams } from '../data/scenarioPlan';
import { ScenarioPlanParamsSchema, type ScenarioPlanParams } from '../schema';
import { safeJSONStorage } from './safeStorage';

/** קבוצת פרמטרים אחת (מקור) בתכנון התרחישים. */
export type PlanParamGroup = keyof ScenarioPlanParams;

/** מצב טאב תכנון התרחישים: כללי מילוי האספקה. */
interface ScenarioPlanState {
  params: ScenarioPlanParams;
  /** משנה שדות של מקור אחד. */
  setParam: <G extends PlanParamGroup>(group: G, patch: Partial<ScenarioPlanParams[G]>) => void;
  /** מחזיר את ערכי ברירת המחדל. */
  reset: () => void;
}

/** חנות תכנון התרחישים (נשמרת ב-localStorage; מצב לא תקין מוחלף בברירות המחדל). */
export const useScenarioPlanStore = create<ScenarioPlanState>()(
  persist(
    (set) => ({
      params: structuredClone(defaultPlanParams),
      setParam: (group, patch) => set((st) => ({ params: { ...st.params, [group]: { ...st.params[group], ...patch } } })),
      reset: () => set({ params: structuredClone(defaultPlanParams) }),
    }),
    {
      name: 'energy-dashboard/scenario-plan',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({ params: st.params }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { params?: unknown };
        // מקור שחסר במצב השמור מקבל את ברירת המחדל שלו.
        const merged =
          p.params && typeof p.params === 'object' ? { ...defaultPlanParams, ...(p.params as object) } : undefined;
        const parsed = ScenarioPlanParamsSchema.safeParse(merged);
        return { ...current, ...(parsed.success ? { params: parsed.data } : {}) };
      },
    },
  ),
);

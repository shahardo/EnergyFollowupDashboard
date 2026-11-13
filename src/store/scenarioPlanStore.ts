import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SUPPLY_PRESETS } from '../data/baseline';
import { planPresets } from '../data/scenarioPlan';
import { ScenarioPlanParamsSchema, type ScenarioPlanParams, type SupplyPreset } from '../schema';
import { safeJSONStorage } from './safeStorage';
import { useSupplyStore } from './supplyStore';

/** קבוצת פרמטרים אחת (מקור) בתכנון התרחישים. */
export type PlanParamGroup = keyof ScenarioPlanParams;

/** מצב טאב תכנון התרחישים: כללי מילוי האספקה לכל מדיניות היצע. */
interface ScenarioPlanState {
  /** המדיניות הפעילה: תמיד זו של חנות ההיצע (אותו תפריט בשני הטאבים). */
  active: SupplyPreset;
  /** הכללים של כל מדיניות, עם העריכות שלה. */
  presets: Record<SupplyPreset, ScenarioPlanParams>;
  /** הכללים של המדיניות הפעילה (= presets[active]). */
  params: ScenarioPlanParams;
  /** משנה שדות של מקור אחד במדיניות הפעילה. */
  setParam: <G extends PlanParamGroup>(group: G, patch: Partial<ScenarioPlanParams[G]>) => void;
  /** עוברת למדיניות אחרת (נקרא מהמנוי לחנות ההיצע). */
  setActive: (active: SupplyPreset) => void;
  /** מחזיר את ערכי הדוגמה של המדיניות הפעילה בלבד. */
  reset: () => void;
}

const initialPresets = (): Record<SupplyPreset, ScenarioPlanParams> => structuredClone(planPresets);
const initialActive = useSupplyStore.getState().active;

/** חנות תכנון התרחישים (נשמרת ב-localStorage, גרסה 2; מדיניות לא תקינה מוחלפת בערכי הדוגמה שלה). */
export const useScenarioPlanStore = create<ScenarioPlanState>()(
  persist(
    (set) => ({
      active: initialActive,
      presets: initialPresets(),
      params: structuredClone(planPresets[initialActive]),
      setParam: (group, patch) =>
        set((st) => {
          const params = { ...st.params, [group]: { ...st.params[group], ...patch } };
          return { params, presets: { ...st.presets, [st.active]: params } };
        }),
      setActive: (active) => set((st) => (st.active === active ? {} : { active, params: st.presets[active] })),
      reset: () =>
        set((st) => {
          const params = structuredClone(planPresets[st.active]);
          return { params, presets: { ...st.presets, [st.active]: params } };
        }),
    }),
    {
      name: 'energy-dashboard/scenario-plan',
      storage: safeJSONStorage,
      version: 2,
      partialize: (st) => ({ presets: st.presets }),
      // גרסה 1 שמרה כללים אחדים: הם נכנסים למדיניות המוצהרת.
      migrate: (persisted, version) => {
        if (version >= 2) return persisted;
        const p = (persisted ?? {}) as { params?: unknown };
        return { presets: { declared: p.params } };
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { presets?: Record<string, unknown> };
        const presets = { ...current.presets };
        for (const preset of SUPPLY_PRESETS) {
          const saved = p.presets?.[preset];
          // מקור שחסר במצב השמור מקבל את ערכי הדוגמה שלו.
          const merged = saved && typeof saved === 'object' ? { ...planPresets[preset], ...saved } : undefined;
          const parsed = ScenarioPlanParamsSchema.safeParse(merged);
          if (parsed.success) presets[preset] = parsed.data;
        }
        const active = useSupplyStore.getState().active;
        return { ...current, active, presets, params: presets[active] };
      },
    },
  ),
);

// התפריט בשני הטאבים הוא אותה בחירה: הכללים עוקבים אחרי המדיניות הפעילה של חנות ההיצע.
useSupplyStore.subscribe((s, prev) => {
  if (s.active !== prev.active) useScenarioPlanStore.getState().setActive(s.active);
});

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SUPPLY_PRESET, SUPPLY_PRESETS, supplyPresets } from '../data/baseline';
import { upgradeSupply } from '../data/upgradeSupply';
import {
  SupplyPresetSchema,
  SupplyScenarioSchema,
  type SupplyPreset,
  type SupplyScenario,
  type SupplySource,
} from '../schema';
import { safeJSONStorage } from './safeStorage';

interface SupplyState {
  /** התרחיש המוכן שנבחר בתפריט. */
  active: SupplyPreset;
  /** כל אחד משלושת התרחישים, עם השינויים שהמשתמש עשה בו. */
  scenarios: Record<SupplyPreset, SupplyScenario>;
  /** התרחיש הפעיל (= scenarios[active]), לנוחות הסלקטורים. */
  scenario: SupplyScenario;
  /** התרחיש לפני ההשלמה האוטומטית האחרונה, לביטול. לא נשמר ב-localStorage. */
  previous: SupplyScenario | null;
  select: (preset: SupplyPreset) => void;
  setFillPriority: (keys: string[]) => void;
  /** מחליף את התרחיש בתוצאת ההשלמה ושומר את הקודם לביטול. */
  applyAutoFill: (s: SupplyScenario) => void;
  undoAutoFill: () => void;
  updateSource: (key: string, patch: Partial<SupplySource>) => void;
  /** טוען תרחיש (פתיחה או שכפול) לתרחיש המוכן שלו, או לפעיל אם אין לו, ובוחר בו. */
  setScenario: (s: SupplyScenario) => void;
  rename: (name: string) => void;
  /** מחזיר רק את התרחיש הפעיל לערכי הדוגמה שלו. */
  reset: () => void;
}

const clone = <T,>(v: T): T => structuredClone(v);

const initialScenarios = (): Record<SupplyPreset, SupplyScenario> =>
  Object.fromEntries(SUPPLY_PRESETS.map((p) => [p, clone(supplyPresets[p])])) as Record<SupplyPreset, SupplyScenario>;

/** מעדכן את התרחיש הפעיל בשני המקומות. */
const patchActive =
  (fn: (s: SupplyScenario) => SupplyScenario) =>
  (st: SupplyState): Partial<SupplyState> => {
    const scenario = fn(st.scenario);
    return { scenario, scenarios: { ...st.scenarios, [st.active]: scenario } };
  };

export const useSupplyStore = create<SupplyState>()(
  persist(
    (set) => ({
      active: DEFAULT_SUPPLY_PRESET,
      scenarios: initialScenarios(),
      scenario: clone(supplyPresets[DEFAULT_SUPPLY_PRESET]),
      previous: null,
      select: (active) => set((st) => ({ active, scenario: st.scenarios[active], previous: null })),
      setFillPriority: (fillPriority) => set(patchActive((sc) => ({ ...sc, fillPriority }))),
      applyAutoFill: (next) => set((st) => ({ ...patchActive(() => next)(st), previous: st.scenario })),
      undoAutoFill: () =>
        set((st) => {
          const prev = st.previous;
          return prev ? { ...patchActive(() => prev)(st), previous: null } : {};
        }),
      updateSource: (key, patch) =>
        set(
          patchActive((sc) => ({
            ...sc,
            sources: sc.sources.map((s) => (s.key === key ? { ...s, ...patch } : s)),
          })),
        ),
      setScenario: (s) =>
        set((st) => {
          const active = s.preset ?? st.active;
          const scenario = upgradeSupply({ ...s, preset: active }, supplyPresets[active]);
          return { active, scenario, scenarios: { ...st.scenarios, [active]: scenario }, previous: null };
        }),
      rename: (name) => set(patchActive((sc) => ({ ...sc, name }))),
      reset: () =>
        set((st) => ({
          ...patchActive(() => clone(supplyPresets[st.active]))(st),
          previous: null,
        })),
    }),
    {
      name: 'energy-dashboard/supply',
      storage: safeJSONStorage,
      version: 2,
      partialize: (st) => ({ active: st.active, scenarios: st.scenarios }),
      // גרסה 1 שמרה תרחיש יחיד: הוא נכנס לתרחיש המוכן שלו (או למדיניות המוצהרת), והשאר מגיעים מערכי הדוגמה.
      migrate: (persisted, version) => {
        if (version >= 2) return persisted;
        const old = SupplyScenarioSchema.safeParse((persisted as { scenario?: unknown })?.scenario);
        if (!old.success) return {};
        const active = old.data.preset ?? DEFAULT_SUPPLY_PRESET;
        return { active, scenarios: { [active]: old.data } };
      },
      // כל תרחיש נבדק בנפרד; תרחיש לא תקין מוחלף בערכי הדוגמה שלו.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { active?: unknown; scenarios?: Record<string, unknown> };
        const active = SupplyPresetSchema.safeParse(p.active).data ?? current.active;
        const scenarios = { ...current.scenarios };
        for (const preset of SUPPLY_PRESETS) {
          const parsed = SupplyScenarioSchema.safeParse(p.scenarios?.[preset]);
          if (parsed.success) scenarios[preset] = upgradeSupply({ ...parsed.data, preset }, supplyPresets[preset]);
        }
        return { ...current, active, scenarios, scenario: scenarios[active] };
      },
    },
  ),
);

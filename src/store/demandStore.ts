import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DEMAND_PRESET, DEMAND_PRESETS, demandPresets } from '../data/baseline';
import { upgradeDemand } from '../data/upgradeDemand';
import { NO_MEASURES } from '../model/measures';
import {
  DemandPresetSchema,
  DemandScenarioSchema,
  type DemandPreset,
  type DemandScenario,
  type Measures,
  type SectorDemand,
} from '../schema';
import { safeJSONStorage } from './safeStorage';

/** מצב הביקוש: שלושת התרחישים המוכנים, כל אחד עם העריכות שלו, והתרחיש הנבחר. */
interface DemandState {
  /** התרחיש המוכן שנבחר בתפריט. */
  active: DemandPreset;
  /** כל אחד משלושת התרחישים, עם השינויים שהמשתמש עשה בו. */
  scenarios: Record<DemandPreset, DemandScenario>;
  /** התרחיש הפעיל (= scenarios[active]), לנוחות הסלקטורים. */
  scenario: DemandScenario;
  select: (preset: DemandPreset) => void;
  updateSector: (key: string, patch: Partial<SectorDemand>) => void;
  /** מעדכן את אחוזי ההתייעלות והחיסכון. */
  setMeasures: (patch: Partial<Measures>) => void;
  /** טוען תרחיש (פתיחה או שכפול) לתרחיש המוכן שלו, או לפעיל אם אין לו, ובוחר בו. */
  setScenario: (s: DemandScenario) => void;
  rename: (name: string) => void;
  /** מחזיר רק את התרחיש הפעיל לערכי הדוגמה שלו. */
  reset: () => void;
}

const initialScenarios = (): Record<DemandPreset, DemandScenario> =>
  Object.fromEntries(DEMAND_PRESETS.map((p) => [p, structuredClone(demandPresets[p])])) as Record<DemandPreset, DemandScenario>;

/** מעדכן את התרחיש הפעיל בשני המקומות. */
const patchActive =
  (fn: (s: DemandScenario) => DemandScenario) =>
  (st: DemandState): Partial<DemandState> => {
    const scenario = fn(st.scenario);
    return { scenario, scenarios: { ...st.scenarios, [st.active]: scenario } };
  };

/** חנות תרחישי הביקוש (נשמרת ב-localStorage, גרסה 2). */
export const useDemandStore = create<DemandState>()(
  persist(
    (set) => ({
      active: DEFAULT_DEMAND_PRESET,
      scenarios: initialScenarios(),
      scenario: structuredClone(demandPresets[DEFAULT_DEMAND_PRESET]),
      select: (active) => set((st) => ({ active, scenario: st.scenarios[active] })),
      updateSector: (key, patch) =>
        set(
          patchActive((sc) => ({
            ...sc,
            sectors: sc.sectors.map((s) => (s.key === key ? { ...s, ...patch } : s)),
          })),
        ),
      setMeasures: (patch) =>
        set(
          patchActive((sc) => ({
            ...sc,
            measures: { ...NO_MEASURES, ...sc.measures, ...patch },
          })),
        ),
      setScenario: (s) =>
        set((st) => {
          const active = s.preset ?? st.active;
          const scenario = upgradeDemand({ ...s, preset: active }, demandPresets[active]);
          return { active, scenario, scenarios: { ...st.scenarios, [active]: scenario } };
        }),
      rename: (name) => set(patchActive((sc) => ({ ...sc, name }))),
      reset: () => set((st) => patchActive(() => structuredClone(demandPresets[st.active]))(st)),
    }),
    {
      name: 'energy-dashboard/demand',
      storage: safeJSONStorage,
      version: 2,
      partialize: (st) => ({ active: st.active, scenarios: st.scenarios }),
      // גרסה 1 שמרה תרחיש יחיד: הוא נכנס לתרחיש המוכן שלו (או לבינוני), והשאר מגיעים מערכי הדוגמה.
      migrate: (persisted, version) => {
        if (version >= 2) return persisted;
        const old = DemandScenarioSchema.safeParse((persisted as { scenario?: unknown })?.scenario);
        if (!old.success) return {};
        const active = old.data.preset ?? DEFAULT_DEMAND_PRESET;
        return { active, scenarios: { [active]: old.data } };
      },
      // כל תרחיש נבדק בנפרד; תרחיש לא תקין מוחלף בערכי הדוגמה שלו.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { active?: unknown; scenarios?: Record<string, unknown> };
        const active = DemandPresetSchema.safeParse(p.active).data ?? current.active;
        const scenarios = { ...current.scenarios };
        for (const preset of DEMAND_PRESETS) {
          const parsed = DemandScenarioSchema.safeParse(p.scenarios?.[preset]);
          if (parsed.success) scenarios[preset] = upgradeDemand({ ...parsed.data, preset }, demandPresets[preset]);
        }
        return { ...current, active, scenarios, scenario: scenarios[active] };
      },
    },
  ),
);

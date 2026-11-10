import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { baselineSupply } from '../data/baseline';
import { upgradeSupply } from '../data/upgradeSupply';
import { SupplyScenarioSchema, type SupplyScenario, type SupplySource } from '../schema';
import { safeJSONStorage } from './safeStorage';

interface SupplyState {
  scenario: SupplyScenario;
  /** התרחיש לפני ההשלמה האוטומטית האחרונה, לביטול. לא נשמר ב-localStorage. */
  previous: SupplyScenario | null;
  setFillPriority: (keys: string[]) => void;
  /** מחליף את התרחיש בתוצאת ההשלמה ושומר את הקודם לביטול. */
  applyAutoFill: (s: SupplyScenario) => void;
  undoAutoFill: () => void;
  updateSource: (key: string, patch: Partial<SupplySource>) => void;
  setScenario: (s: SupplyScenario) => void;
  rename: (name: string) => void;
  reset: () => void;
}

const clone = <T,>(v: T): T => structuredClone(v);

export const useSupplyStore = create<SupplyState>()(
  persist(
    (set) => ({
      scenario: clone(baselineSupply),
      previous: null,
      setFillPriority: (fillPriority) => set((st) => ({ scenario: { ...st.scenario, fillPriority } })),
      applyAutoFill: (next) => set((st) => ({ previous: st.scenario, scenario: next })),
      undoAutoFill: () => set((st) => (st.previous ? { scenario: st.previous, previous: null } : {})),
      updateSource: (key, patch) =>
        set((st) => ({
          scenario: {
            ...st.scenario,
            sources: st.scenario.sources.map((s) => (s.key === key ? { ...s, ...patch } : s)),
          },
        })),
      setScenario: (scenario) => set({ scenario: upgradeSupply(scenario), previous: null }),
      rename: (name) => set((st) => ({ scenario: { ...st.scenario, name } })),
      reset: () => set({ scenario: clone(baselineSupply), previous: null }),
    }),
    {
      name: 'energy-dashboard/supply',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({ scenario: st.scenario }),
      merge: (persisted, current) => {
        const parsed = SupplyScenarioSchema.safeParse((persisted as Partial<SupplyState>)?.scenario);
        return parsed.success ? { ...current, scenario: upgradeSupply(parsed.data) } : current;
      },
    },
  ),
);

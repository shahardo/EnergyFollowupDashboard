import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { baselineSupply } from '../data/baseline';
import { SupplyScenarioSchema, type SupplyScenario, type SupplySource } from '../schema';
import { safeJSONStorage } from './safeStorage';

interface SupplyState {
  scenario: SupplyScenario;
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
      updateSource: (key, patch) =>
        set((st) => ({
          scenario: {
            ...st.scenario,
            sources: st.scenario.sources.map((s) => (s.key === key ? { ...s, ...patch } : s)),
          },
        })),
      setScenario: (scenario) => set({ scenario }),
      rename: (name) => set((st) => ({ scenario: { ...st.scenario, name } })),
      reset: () => set({ scenario: clone(baselineSupply) }),
    }),
    {
      name: 'energy-dashboard/supply',
      storage: safeJSONStorage,
      version: 1,
      merge: (persisted, current) => {
        const parsed = SupplyScenarioSchema.safeParse((persisted as Partial<SupplyState>)?.scenario);
        return parsed.success ? { ...current, scenario: parsed.data } : current;
      },
    },
  ),
);

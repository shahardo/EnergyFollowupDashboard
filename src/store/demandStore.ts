import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { baselineDemand } from '../data/baseline';
import { upgradeDemand } from '../data/upgradeDemand';
import { DemandScenarioSchema, type DemandScenario, type Measures, type SectorDemand } from '../schema';
import { safeJSONStorage } from './safeStorage';

interface DemandState {
  scenario: DemandScenario;
  updateSector: (key: string, patch: Partial<SectorDemand>) => void;
  setMeasures: (patch: Partial<Measures>) => void;
  setScenario: (s: DemandScenario) => void;
  rename: (name: string) => void;
  reset: () => void;
}

const clone = <T,>(v: T): T => structuredClone(v);

export const useDemandStore = create<DemandState>()(
  persist(
    (set) => ({
      scenario: clone(baselineDemand),
      updateSector: (key, patch) =>
        set((st) => ({
          scenario: {
            ...st.scenario,
            sectors: st.scenario.sectors.map((s) => (s.key === key ? { ...s, ...patch } : s)),
          },
        })),
      setMeasures: (patch) =>
        set((st) => ({
          scenario: {
            ...st.scenario,
            measures: { efficiencyPct: 0, savingPct: 0, ...st.scenario.measures, ...patch },
          },
        })),
      setScenario: (scenario) => set({ scenario: upgradeDemand(scenario) }),
      rename: (name) => set((st) => ({ scenario: { ...st.scenario, name } })),
      reset: () => set({ scenario: clone(baselineDemand) }),
    }),
    {
      name: 'energy-dashboard/demand',
      storage: safeJSONStorage,
      version: 1,
      // מצב שמור שלא עובר את הסכמה מוחלף בתרחיש הבסיס.
      merge: (persisted, current) => {
        const parsed = DemandScenarioSchema.safeParse((persisted as Partial<DemandState>)?.scenario);
        return parsed.success ? { ...current, scenario: upgradeDemand(parsed.data) } : current;
      },
    },
  ),
);

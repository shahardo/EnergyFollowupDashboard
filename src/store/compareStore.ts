import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DemandScenarioSchema, SupplyScenarioSchema, type DemandScenario, type SupplyScenario } from '../schema';
import { safeJSONStorage } from './safeStorage';

/** תרחישים שנטענו להשוואה. מוצגים כקו מקווקו על הגרף, ולא משפיעים על החישוב הראשי. */
interface CompareState {
  demand: DemandScenario | null;
  supply: SupplyScenario | null;
  setDemand: (s: DemandScenario | null) => void;
  setSupply: (s: SupplyScenario | null) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set) => ({
      demand: null,
      supply: null,
      setDemand: (demand) => set({ demand }),
      setSupply: (supply) => set({ supply }),
      clear: () => set({ demand: null, supply: null }),
    }),
    {
      name: 'energy-dashboard/compare',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({ demand: st.demand, supply: st.supply }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CompareState>;
        const d = DemandScenarioSchema.safeParse(p.demand);
        const s = SupplyScenarioSchema.safeParse(p.supply);
        return { ...current, demand: d.success ? d.data : null, supply: s.success ? s.data : null };
      },
    },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

export type Units = 'twh' | 'gw';

interface UiState {
  targetYear: number;
  units: Units;
  setTargetYear: (y: number) => void;
  setUnits: (u: Units) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      targetYear: 2035,
      units: 'twh',
      setTargetYear: (targetYear) => set({ targetYear }),
      setUnits: (units) => set({ units }),
    }),
    { name: 'energy-dashboard/ui', storage: safeJSONStorage, version: 1 },
  ),
);

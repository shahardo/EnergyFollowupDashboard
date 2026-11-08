import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

export type Units = 'twh' | 'gw';

interface UiState {
  targetYear: number;
  units: Units;
  /** האם פאנל ההשלמה האוטומטית פתוח. ברירת מחדל: מקופל. */
  autofillOpen: boolean;
  setAutofillOpen: (open: boolean) => void;
  setTargetYear: (y: number) => void;
  setUnits: (u: Units) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      targetYear: 2035,
      units: 'twh',
      autofillOpen: false,
      setAutofillOpen: (autofillOpen) => set({ autofillOpen }),
      setTargetYear: (targetYear) => set({ targetYear }),
      setUnits: (units) => set({ units }),
    }),
    { name: 'energy-dashboard/ui', storage: safeJSONStorage, version: 1 },
  ),
);

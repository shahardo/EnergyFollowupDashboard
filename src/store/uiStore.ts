import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

export type Units = 'twh' | 'gw';
/** רמת הפירוט בפאנלי הפרמטרים: high = הכול, medium = סליידרים בלי ערכים בצד, low = רק מקרא. */
export type Detail = 'high' | 'medium' | 'low';
const DETAILS: Detail[] = ['high', 'medium', 'low'];

interface UiState {
  targetYear: number;
  units: Units;
  detail: Detail;
  /** האם פאנל ההתאמה האוטומטית פתוח. לא נשמר: בכל פתיחה של הדף הוא מקופל. */
  autofillOpen: boolean;
  setAutofillOpen: (open: boolean) => void;
  setTargetYear: (y: number) => void;
  setUnits: (u: Units) => void;
  setDetail: (d: Detail) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      targetYear: 2035,
      units: 'twh',
      detail: 'high',
      autofillOpen: false,
      setAutofillOpen: (autofillOpen) => set({ autofillOpen }),
      setTargetYear: (targetYear) => set({ targetYear }),
      setUnits: (units) => set({ units }),
      setDetail: (detail) => set({ detail }),
    }),
    {
      name: 'energy-dashboard/ui',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({ targetYear: st.targetYear, units: st.units, detail: st.detail }),
      // גם מצב שנשמר בגרסה קודמת (עם autofillOpen) לא פותח את הפאנל.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...(typeof p.targetYear === 'number' ? { targetYear: p.targetYear } : {}),
          ...(p.units === 'twh' || p.units === 'gw' ? { units: p.units } : {}),
          ...(p.detail && DETAILS.includes(p.detail) ? { detail: p.detail } : {}),
        };
      },
    },
  ),
);

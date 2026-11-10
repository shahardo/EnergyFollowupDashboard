import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

/** twh = אנרגיה, gw = הספק שיא, toe = אנרגיה ראשונית (מיליון שעט"ן), bcm = צריכת גז. */
export type Units = 'twh' | 'gw' | 'toe' | 'bcm';
const UNITS: Units[] = ['twh', 'gw', 'toe', 'bcm'];
/** רמת הפירוט בפאנלי הפרמטרים: high = הכול, medium = סליידרים בלי ערכים בצד, low = רק מקרא. */
export type Detail = 'high' | 'medium' | 'low';
const DETAILS: Detail[] = ['high', 'medium', 'low'];
/** שנות הייחוס לחישוב אחוזי הביצוע בטאב המעקב. */
export const TRACKING_YEARS = [2035, 2040, 2050] as const;
export type TrackingYear = (typeof TRACKING_YEARS)[number];

interface UiState {
  targetYear: number;
  units: Units;
  detail: Detail;
  /** שנת הייחוס של כרטיסי המעקב: נספרות המשימות שמתוכננות להסתיים עד סופה. */
  trackingYear: TrackingYear;
  /** האם פאנל ההתאמה האוטומטית פתוח. לא נשמר: בכל פתיחה של הדף הוא מקופל. */
  autofillOpen: boolean;
  setAutofillOpen: (open: boolean) => void;
  setTargetYear: (y: number) => void;
  setUnits: (u: Units) => void;
  setDetail: (d: Detail) => void;
  setTrackingYear: (y: TrackingYear) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      targetYear: 2035,
      units: 'twh',
      detail: 'high',
      trackingYear: 2035,
      autofillOpen: false,
      setAutofillOpen: (autofillOpen) => set({ autofillOpen }),
      setTargetYear: (targetYear) => set({ targetYear }),
      setUnits: (units) => set({ units }),
      setDetail: (detail) => set({ detail }),
      setTrackingYear: (trackingYear) => set({ trackingYear }),
    }),
    {
      name: 'energy-dashboard/ui',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({
        targetYear: st.targetYear,
        units: st.units,
        detail: st.detail,
        trackingYear: st.trackingYear,
      }),
      // גם מצב שנשמר בגרסה קודמת (עם autofillOpen) לא פותח את הפאנל.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...(typeof p.targetYear === 'number' ? { targetYear: p.targetYear } : {}),
          ...(p.units && UNITS.includes(p.units) ? { units: p.units } : {}),
          ...(p.detail && DETAILS.includes(p.detail) ? { detail: p.detail } : {}),
          ...(p.trackingYear && TRACKING_YEARS.includes(p.trackingYear) ? { trackingYear: p.trackingYear } : {}),
        };
      },
    },
  ),
);

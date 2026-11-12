import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

/** twh = אנרגיה, gw = הספק שיא, toe = אנרגיה ראשונית (מיליון שעט"ן), bcm = צריכת גז, co2 = פליטות (מיליון tCO₂eq). */
export type Units = 'twh' | 'gw' | 'toe' | 'bcm' | 'co2';
const UNITS: Units[] = ['twh', 'gw', 'toe', 'bcm', 'co2'];
/** רמת הפירוט בפאנלי הפרמטרים: high = הכול, medium = סליידרים בלי ערכים בצד, low = רק מקרא. */
export type Detail = 'high' | 'medium' | 'low';
const DETAILS: Detail[] = ['high', 'medium', 'low'];
/** שנות הייחוס לחישוב אחוזי הביצוע בטאב המעקב. */
export const TRACKING_YEARS = [2035, 2040, 2050] as const;
/** שנת ייחוס אחת מתוך TRACKING_YEARS. */
export type TrackingYear = (typeof TRACKING_YEARS)[number];

/** העדפות התצוגה. */
interface UiState {
  /** שנת היעד של כרטיסי ה-KPI ושל קו השנה בגרפים. */
  targetYear: number;
  units: Units;
  detail: Detail;
  /** שנת הייחוס של כרטיסי המעקב: נספרות המשימות שמתוכננות להסתיים עד סופה. */
  trackingYear: TrackingYear;
  /** פסי ההתייעלות והחיסכון בגרף הביקוש: true = מודגשים, false = בהירים ועדינים. */
  reductionBold: boolean;
  /** האם פאנל ההתאמה האוטומטית פתוח. לא נשמר: בכל פתיחה של הדף הוא מקופל. */
  autofillOpen: boolean;
  setAutofillOpen: (open: boolean) => void;
  setTargetYear: (y: number) => void;
  setUnits: (u: Units) => void;
  setDetail: (d: Detail) => void;
  setTrackingYear: (y: TrackingYear) => void;
  setReductionBold: (v: boolean) => void;
}

/** חנות העדפות התצוגה (נשמרת ב-localStorage, חוץ מ-autofillOpen). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      targetYear: 2035,
      units: 'twh',
      detail: 'high',
      trackingYear: 2035,
      reductionBold: true,
      autofillOpen: false,
      setAutofillOpen: (autofillOpen) => set({ autofillOpen }),
      setTargetYear: (targetYear) => set({ targetYear }),
      setUnits: (units) => set({ units }),
      setDetail: (detail) => set({ detail }),
      setTrackingYear: (trackingYear) => set({ trackingYear }),
      setReductionBold: (reductionBold) => set({ reductionBold }),
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
        reductionBold: st.reductionBold,
      }),
      // גם מצב שנשמר בגרסה קודמת (עם autofillOpen) לא פותח את הפאנל.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...(Number.isInteger(p.targetYear) ? { targetYear: p.targetYear } : {}),
          ...(p.units && UNITS.includes(p.units) ? { units: p.units } : {}),
          ...(p.detail && DETAILS.includes(p.detail) ? { detail: p.detail } : {}),
          ...(p.trackingYear && TRACKING_YEARS.includes(p.trackingYear) ? { trackingYear: p.trackingYear } : {}),
          ...(typeof p.reductionBold === 'boolean' ? { reductionBold: p.reductionBold } : {}),
        };
      },
    },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

/** twh = energy, gw = peak power, toe = primary energy (million toe), bcm = gas consumption, co2 = emissions (million tCO₂eq). */
export type Units = 'twh' | 'gw' | 'toe' | 'bcm' | 'co2';
const UNITS: Units[] = ['twh', 'gw', 'toe', 'bcm', 'co2'];
/** The unit of the total-energy charts (the menu on their Y axis): million toe, PJ or TWh. */
export type EnergyUnit = 'mtoe' | 'pj' | 'twh';
/** Every energy unit, in menu order. */
export const ENERGY_UNITS: EnergyUnit[] = ['mtoe', 'pj', 'twh'];
/** Detail level in the parameter panels: high = everything, medium = sliders without side values, low = legend only. */
export type Detail = 'high' | 'medium' | 'low';
const DETAILS: Detail[] = ['high', 'medium', 'low'];
/** Demand chart view (all tabs): by sector, or by energy source (electricity, fuels, natural gas). */
export type PlanView = 'sectors' | 'carriers';
const PLAN_VIEWS: PlanView[] = ['sectors', 'carriers'];
/** תצוגת טאב הטרילמה: משולשים (2D) או פירמידות יישימות (3D). */
export type TrilemmaView = '2d' | '3d';
const TRILEMMA_VIEWS: TrilemmaView[] = ['2d', '3d'];
/** Supply chart view (all tabs): by supply channel (source), or by final energy (electricity, fuels, gas). */
export type SupplyView = 'sources' | 'carriers';
const SUPPLY_VIEWS: SupplyView[] = ['sources', 'carriers'];
/** Reference years for the progress percentages in the tracking tab. */
export const TRACKING_YEARS = [2035, 2040, 2050] as const;
/** One reference year out of TRACKING_YEARS. */
export type TrackingYear = (typeof TRACKING_YEARS)[number];

/** Display preferences. */
interface UiState {
  /** Target year for the KPI cards and the year line in the charts. */
  targetYear: number;
  units: Units;
  /** The unit of the total-energy charts, across all tabs. */
  energyUnit: EnergyUnit;
  detail: Detail;
  /** The view in the demand charts, across all tabs: shared, so the choice is the same everywhere. */
  planView: PlanView;
  /** התצוגה בטאב הטרילמה. */
  trilemmaView: TrilemmaView;
  /** The view in the supply charts, across all tabs: shared, so the choice is the same everywhere. */
  supplyView: SupplyView;
  /** Reference year for the tracking cards: counts tasks planned to finish by its end. */
  trackingYear: TrackingYear;
  /** The efficiency and saving bands in the demand chart: true = bold, false = light and faint. */
  reductionBold: boolean;
  /**
   * The expanded groups (second detail level), shared by every chart and panel on every tab. Namespaced keys:
   * `sector:<key>` (demand main sector), `dcarrier:<c>` (demand carrier), `cat:<category>` (supply category),
   * `scarrier:<c>` (supply carrier). See `model/groups.ts`.
   */
  expanded: string[];
  /** Whether the auto-fill panel is open. Not persisted: it's collapsed every time the page opens. */
  autofillOpen: boolean;
  setAutofillOpen: (open: boolean) => void;
  setTargetYear: (y: number) => void;
  setUnits: (u: Units) => void;
  setEnergyUnit: (u: EnergyUnit) => void;
  setDetail: (d: Detail) => void;
  setPlanView: (v: PlanView) => void;
  setTrilemmaView: (v: TrilemmaView) => void;
  setSupplyView: (v: SupplyView) => void;
  setTrackingYear: (y: TrackingYear) => void;
  setReductionBold: (v: boolean) => void;
  /** Expands a collapsed group or collapses an expanded one. */
  toggleExpanded: (key: string) => void;
}

/** Display preferences store (persisted to localStorage, except autofillOpen). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      targetYear: 2035,
      units: 'toe',
      energyUnit: 'mtoe',
      detail: 'medium',
      planView: 'carriers',
      trilemmaView: '2d',
      supplyView: 'sources',
      trackingYear: 2035,
      reductionBold: true,
      expanded: [],
      autofillOpen: false,
      setAutofillOpen: (autofillOpen) => set({ autofillOpen }),
      setTargetYear: (targetYear) => set({ targetYear }),
      setUnits: (units) => set({ units }),
      setEnergyUnit: (energyUnit) => set({ energyUnit }),
      setDetail: (detail) => set({ detail }),
      setPlanView: (planView) => set({ planView }),
      setTrilemmaView: (trilemmaView) => set({ trilemmaView }),
      setSupplyView: (supplyView) => set({ supplyView }),
      setTrackingYear: (trackingYear) => set({ trackingYear }),
      setReductionBold: (reductionBold) => set({ reductionBold }),
      toggleExpanded: (key) =>
        set((st) => ({
          expanded: st.expanded.includes(key) ? st.expanded.filter((k) => k !== key) : [...st.expanded, key],
        })),
    }),
    {
      name: 'energy-dashboard/ui',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({
        targetYear: st.targetYear,
        units: st.units,
        energyUnit: st.energyUnit,
        detail: st.detail,
        planView: st.planView,
        trilemmaView: st.trilemmaView,
        supplyView: st.supplyView,
        trackingYear: st.trackingYear,
        reductionBold: st.reductionBold,
        expanded: st.expanded,
      }),
      // Even state persisted by an older version (with autofillOpen) doesn't open the panel.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...(Number.isInteger(p.targetYear) ? { targetYear: p.targetYear } : {}),
          ...(p.units && UNITS.includes(p.units) ? { units: p.units } : {}),
          ...(p.energyUnit && ENERGY_UNITS.includes(p.energyUnit) ? { energyUnit: p.energyUnit } : {}),
          ...(p.detail && DETAILS.includes(p.detail) ? { detail: p.detail } : {}),
          ...(p.planView && PLAN_VIEWS.includes(p.planView) ? { planView: p.planView } : {}),
          ...(p.trilemmaView && TRILEMMA_VIEWS.includes(p.trilemmaView) ? { trilemmaView: p.trilemmaView } : {}),
          ...(p.supplyView && SUPPLY_VIEWS.includes(p.supplyView) ? { supplyView: p.supplyView } : {}),
          ...(p.trackingYear && TRACKING_YEARS.includes(p.trackingYear) ? { trackingYear: p.trackingYear } : {}),
          ...(typeof p.reductionBold === 'boolean' ? { reductionBold: p.reductionBold } : {}),
          ...(Array.isArray(p.expanded) && p.expanded.every((k) => typeof k === 'string')
            ? { expanded: [...new Set(p.expanded)] }
            : // The old "split transport" checkbox becomes the expanded transport group.
              (persisted as { transportExpanded?: unknown } | null)?.transportExpanded === true
              ? { expanded: ['sector:transport'] }
              : {}),
        };
      },
    },
  ),
);

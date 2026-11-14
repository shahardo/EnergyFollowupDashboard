import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_DEMAND_PRESET, DEFAULT_SUPPLY_PRESET, DEMAND_PRESETS, SUPPLY_PRESETS, supplyPresets } from '../data/baseline';
import { planPresets } from '../data/scenarioPlan';
import { upgradeSupply } from '../data/upgradeSupply';
import type { DemandTotal } from '../model/demand';
import { applyPlanRule, isRuleKey } from '../model/scenarioPlan';
import {
  DemandPresetSchema,
  SupplyPresetSchema,
  SupplyScenarioSchema,
  type DemandPreset,
  type ScenarioPlanParams,
  type SupplyPreset,
  type SupplyScenario,
  type SupplySource,
} from '../schema';
import { useDemandStore } from './demandStore';
import { safeJSONStorage } from './safeStorage';

/** קבוצת פרמטרים אחת (מקור או דלק) בכללי תכנון התרחישים. */
export type PlanParamGroup = keyof ScenarioPlanParams;

/** תשעת תרחישי ההיצע: [תרחיש ביקוש][מדיניות]. */
type Grid = Record<DemandPreset, Record<SupplyPreset, SupplyScenario>>;

/** מצב ההיצע: תשעת התרחישים, הנבחר, ונקודת הביטול של ההתאמה האוטומטית. */
interface SupplyState {
  /** תרחיש הביקוש הנבחר (מסונכרן מ-demandStore): קובע איזו שורה של תרחישים מוצגת. */
  demandPreset: DemandPreset;
  /** המדיניות שנבחרה בתפריט. */
  active: SupplyPreset;
  /** תשעה תרחישים: לכל תרחיש ביקוש, שלוש מדיניות, כל אחד עם השינויים שהמשתמש עשה בו. */
  scenarios: Grid;
  /** התרחיש הפעיל (= scenarios[demandPreset][active]), לנוחות הסלקטורים. */
  scenario: SupplyScenario;
  /**
   * התרחיש לפני ההשלמה האוטומטית האחרונה, לביטול. לא נשמר ב-localStorage.
   * כל עריכה אחרת מנקה אותו, כדי שביטול לא ימחק עריכות שנעשו אחרי ההתאמה.
   */
  previous: SupplyScenario | null;
  select: (preset: SupplyPreset) => void;
  /** נקרא כשתרחיש הביקוש מתחלף. */
  setDemandPreset: (preset: DemandPreset) => void;
  setFillPriority: (keys: string[]) => void;
  /** מחליף את התרחיש בתוצאת ההשלמה ושומר את הקודם לביטול. */
  applyAutoFill: (s: SupplyScenario) => void;
  undoAutoFill: () => void;
  updateSource: (key: string, patch: Partial<SupplySource>) => void;
  /**
   * משנה כלל של טאב תכנון התרחישים בתרחיש הפעיל. כלל של מקור חשמל כותב מחדש את העקומה של אותו מקור
   * וממלא את הגז מחדש מול totals (הביקוש נטו); שאר המקורות לא משתנים. תמהיל הדלקים לא נוגע בעקומות.
   */
  setPlanParam: <G extends PlanParamGroup>(group: G, patch: Partial<ScenarioPlanParams[G]>, totals: DemandTotal[]) => void;
  /**
   * טוען תרחיש (פתיחה או שכפול) למקום שלו לפי preset ו-demandPreset (בהיעדרם: הנבחרים), ובוחר בו.
   * אם הוא שייך לתרחיש ביקוש אחר, גם הביקוש עובר אליו.
   */
  setScenario: (s: SupplyScenario) => void;
  rename: (name: string) => void;
  /** מחזיר רק את התרחיש הפעיל לערכי הדוגמה שלו. */
  reset: () => void;
}

const initialScenarios = (): Grid =>
  Object.fromEntries(
    DEMAND_PRESETS.map((d) => [d, Object.fromEntries(SUPPLY_PRESETS.map((p) => [p, structuredClone(supplyPresets[d][p])]))]),
  ) as Grid;

/** הרשת עם תרחיש חדש במקום אחד. */
const withSlot = (g: Grid, d: DemandPreset, p: SupplyPreset, s: SupplyScenario): Grid => ({
  ...g,
  [d]: { ...g[d], [p]: s },
});

/** מעדכן את התרחיש הפעיל בשני המקומות, ומנקה את נקודת הביטול (עריכה ידנית). */
const patchActive =
  (fn: (s: SupplyScenario) => SupplyScenario) =>
  (st: SupplyState): Partial<SupplyState> => {
    const scenario = fn(st.scenario);
    return { scenario, scenarios: withSlot(st.scenarios, st.demandPreset, st.active, scenario), previous: null };
  };

/** חנות תרחישי ההיצע (נשמרת ב-localStorage, גרסה 3). עוקבת אחרי תרחיש הביקוש הנבחר. */
export const useSupplyStore = create<SupplyState>()(
  persist(
    (set) => ({
      demandPreset: useDemandStore.getState().active,
      active: DEFAULT_SUPPLY_PRESET,
      scenarios: initialScenarios(),
      scenario: structuredClone(supplyPresets[useDemandStore.getState().active][DEFAULT_SUPPLY_PRESET]),
      previous: null,
      select: (active) => set((st) => ({ active, scenario: st.scenarios[st.demandPreset][active], previous: null })),
      setDemandPreset: (demandPreset) =>
        set((st) =>
          st.demandPreset === demandPreset
            ? {}
            : { demandPreset, scenario: st.scenarios[demandPreset][st.active], previous: null },
        ),
      setFillPriority: (fillPriority) => set(patchActive((sc) => ({ ...sc, fillPriority }))),
      applyAutoFill: (next) => set((st) => ({ ...patchActive(() => next)(st), previous: st.scenario })),
      undoAutoFill: () =>
        set((st) => {
          const prev = st.previous;
          return prev ? patchActive(() => prev)(st) : {};
        }),
      updateSource: (key, patch) =>
        set(
          patchActive((sc) => ({
            ...sc,
            sources: sc.sources.map((s) => (s.key === key ? { ...s, ...patch } : s)),
          })),
        ),
      setPlanParam: (group, patch, totals) =>
        set(
          patchActive((sc) => {
            const params = sc.planParams ?? planPresets[sc.preset ?? DEFAULT_SUPPLY_PRESET];
            const next = { ...sc, planParams: { ...params, [group]: { ...params[group], ...patch } } };
            return isRuleKey(group) ? applyPlanRule(next, group, totals) : next;
          }),
        ),
      setScenario: (s) => {
        const st = useSupplyStore.getState();
        const demandPreset = s.demandPreset ?? st.demandPreset;
        const active = s.preset ?? st.active;
        const scenario = upgradeSupply({ ...s, preset: active, demandPreset }, supplyPresets[demandPreset][active]);
        set({
          demandPreset,
          active,
          scenario,
          scenarios: withSlot(st.scenarios, demandPreset, active, scenario),
          previous: null,
        });
        // ההיצע הותאם לתרחיש ביקוש מסוים: מציגים אותו מולו.
        if (useDemandStore.getState().active !== demandPreset) useDemandStore.getState().select(demandPreset);
      },
      rename: (name) => set(patchActive((sc) => ({ ...sc, name }))),
      reset: () =>
        set((st) => patchActive(() => structuredClone(supplyPresets[st.demandPreset][st.active]))(st)),
    }),
    {
      name: 'energy-dashboard/supply',
      storage: safeJSONStorage,
      version: 3,
      partialize: (st) => ({ active: st.active, scenarios: st.scenarios }),
      // גרסאות קודמות שמרו תרחיש אחד (1) או שלושה (2): הם נכנסים לשורה של הביקוש הבינוני.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { scenario?: unknown; active?: unknown; scenarios?: Record<string, unknown> };
        if (version >= 3) return p;
        if (version === 2) return { active: p.active, scenarios: { [DEFAULT_DEMAND_PRESET]: p.scenarios ?? {} } };
        const old = SupplyScenarioSchema.safeParse(p.scenario);
        if (!old.success) return {};
        const active = old.data.preset ?? DEFAULT_SUPPLY_PRESET;
        return { active, scenarios: { [DEFAULT_DEMAND_PRESET]: { [active]: old.data } } };
      },
      // כל תרחיש נבדק בנפרד; תרחיש לא תקין מוחלף בערכי הדוגמה שלו.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { active?: unknown; scenarios?: Record<string, Record<string, unknown>> };
        const active = SupplyPresetSchema.safeParse(p.active).data ?? current.active;
        const demandPreset = DemandPresetSchema.safeParse(useDemandStore.getState().active).data ?? current.demandPreset;
        let scenarios = current.scenarios;
        for (const d of DEMAND_PRESETS) {
          for (const preset of SUPPLY_PRESETS) {
            const parsed = SupplyScenarioSchema.safeParse(p.scenarios?.[d]?.[preset]);
            if (parsed.success) {
              const s = upgradeSupply({ ...parsed.data, preset, demandPreset: d }, supplyPresets[d][preset]);
              scenarios = withSlot(scenarios, d, preset, s);
            }
          }
        }
        return { ...current, demandPreset, active, scenarios, scenario: scenarios[demandPreset][active] };
      },
    },
  ),
);

// תרחיש ההיצע עוקב אחרי תרחיש הביקוש הנבחר.
useDemandStore.subscribe((s, prev) => {
  if (s.active !== prev.active) useSupplyStore.getState().setDemandPreset(s.active);
});

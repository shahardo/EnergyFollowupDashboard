import type { SupplyScenario, SupplySource } from '../schema';
import type { DemandTotal } from './demand';
import { autoFill, topUpEveryYear } from './autofill';
import { sourceMtCo2 } from './fuel';
import { computeSupply, sourceCapacity, type SupplyPoint } from './supply';
import { TRILEMMA_AXES, type TrilemmaScore } from './trilemma';

/** הצירים של התעדוף: שלושת צירי הטרילמה, ויישימות. */
export const PRIORITY_AXES = ['sustainability', 'affordability', 'security', 'feasibility'] as const;
/** ציר תעדוף אחד. */
export type PriorityAxis = (typeof PRIORITY_AXES)[number];
/** משקל לכל ציר (מספרים אי-שליליים; מנורמלים לסכום 1 בחישוב). */
export type PriorityWeights = Record<PriorityAxis, number>;

/** משקלות מנורמלים לסכום 1. סכום 0 (או שלילי) נותן משקלות שווים. */
export function normalizeWeights(w: PriorityWeights): PriorityWeights {
  const clean = PRIORITY_AXES.map((a) => Math.max(0, Number.isFinite(w[a]) ? w[a] : 0));
  const sum = clean.reduce((s, v) => s + v, 0);
  const out = {} as PriorityWeights;
  PRIORITY_AXES.forEach((a, i) => (out[a] = sum > 0 ? clean[i] / sum : 1 / PRIORITY_AXES.length));
  return out;
}

/** הציון של ערוץ (0..10) לפי המשקלות: Σ משקל × ציון ציר, והיישימות (0..100) מומרת לסולם 0..10. */
export function meritScore(score: TrilemmaScore, w: PriorityWeights): number {
  const n = normalizeWeights(w);
  let sum = n.feasibility * (score.feasibilityPct / 10);
  for (const a of TRILEMMA_AXES) sum += n[a] * score[a];
  return sum;
}

/** טווח שנות ההתחלה של ערוץ: המוקדמת (אופטימית) והריאלית (שמרנית). */
export interface StartYearRange {
  earliest: number;
  realistic: number;
}

/** משקל יישימות (מנורמל) שממנו ומעלה שנת ההתחלה היא השנה הריאלית. */
export const FEASIBILITY_WEIGHT_FULL = 0.5;

/**
 * שנת ההתחלה בפועל: מהשנה המוקדמת (משקל יישימות 0) לשנה הריאלית (משקל FEASIBILITY_WEIGHT_FULL ומעלה), לינארית,
 * מעוגלת לשנה שלמה. ריאלית מוקדמת מהמוקדמת נחשבת כמוקדמת.
 */
export function effectiveStartYear(range: StartYearRange, feasibilityWeight: number): number {
  const f = Math.min(1, Math.max(0, feasibilityWeight) / FEASIBILITY_WEIGHT_FULL);
  const late = Math.max(range.earliest, range.realistic);
  return Math.round(range.earliest + (late - range.earliest) * f);
}

/** שנת ההתחלה בפועל של כל ערוץ שיש לו טווח, לפי משקל היישימות המנורמל. */
export function startYearsFor(ranges: Record<string, StartYearRange>, w: PriorityWeights): Record<string, number> {
  const f = normalizeWeights(w).feasibility;
  return Object.fromEntries(Object.entries(ranges).map(([k, r]) => [k, effectiveStartYear(r, f)]));
}

/** הפרמטרים של בניית העקומה האידאלית. */
export interface IdealOptions {
  weights: PriorityWeights;
  /** ערוץ שהיישימות שלו נמוכה מזה (באחוזים) לא נבנה מחדש. */
  minFeasibilityPct: number;
  /** השבתה מוקדמת: הצי הקיים של ערוץ שהציון שלו נמוך מזה (0..10) יורד לאפס עד retireByYear. 0 = בלי השבתה. */
  retireBelow: number;
  /** השנה שבה הצי הקיים של ערוץ שמושבת מוקדם מגיע לאפס. */
  retireByYear: number;
  /** תקרת ההספק הכולל לכל ערוץ (GW); null או חסר = בלי תקרה. גובר על maxGW של התרחיש. */
  maxGW: Record<string, number | null>;
  /** טווח שנות ההתחלה לכל ערוץ (רק בנייה חדשה; הצי הקיים לא מושפע). ערוץ שלא מופיע: בלי מגבלה. */
  startYears?: Record<string, StartYearRange>;
}

/** ערוץ אחד בדירוג. */
export interface RankedSource {
  key: string;
  merit: number;
  /** היישימות מעל הסף: הערוץ יכול לקבל הספק חדש. */
  eligible: boolean;
  /** יש לו צי קיים, והציון שלו מתחת לסף ההשבתה. */
  retiring: boolean;
}

/**
 * דירוג הערוצים לפי הציון, מהגבוה לנמוך. בשוויון נשמר הסדר המקורי.
 * retiring מסומן רק לערוץ שיש לו הספק בשנת הבסיס.
 */
export function rankSources(
  sources: SupplySource[],
  scoreOf: (key: string) => TrilemmaScore,
  opts: Pick<IdealOptions, 'weights' | 'minFeasibilityPct' | 'retireBelow'>,
  baseYear: number,
): RankedSource[] {
  return sources
    .map((s, i) => {
      const score = scoreOf(s.key);
      const merit = meritScore(score, opts.weights);
      return {
        i,
        key: s.key,
        merit,
        eligible: score.feasibilityPct >= opts.minFeasibilityPct,
        retiring: merit < opts.retireBelow && sourceCapacity(s, baseYear) > 0,
      };
    })
    .sort((a, b) => b.merit - a.merit || a.i - b.i)
    .map(({ key, merit, eligible, retiring }) => ({ key, merit, eligible, retiring }));
}

/**
 * הצי הקיים: לכל ערוץ, ההספק שלו בשנת הבסיס, קבוע עד retireYear שלו. ערוץ ב-retire יורד לינארית לאפס
 * עד retireByYear. התקרות (maxGW) מתחלפות בתקרות של הכלי.
 */
export function existingFleet(
  scenario: SupplyScenario,
  baseYear: number,
  retire: Set<string>,
  retireByYear: number,
  maxGW: Record<string, number | null>,
): SupplyScenario {
  const sources = scenario.sources.map((s) => {
    const gw0 = sourceCapacity(s, baseYear);
    const capacityGW =
      retire.has(s.key) && gw0 > 0
        ? retireByYear > baseYear
          ? [
              { year: baseYear, gw: gw0 },
              { year: retireByYear, gw: 0 },
            ]
          : [{ year: baseYear, gw: 0 }]
        : [{ year: baseYear, gw: gw0 }];
    // ערוץ בלי צי קיים מסומן כבוי: אם ההשלמה בונה בו, היא מפעילה אותו עם התוספת בלבד.
    const next: SupplySource = { ...s, enabled: gw0 > 0, capacityGW };
    const cap = maxGW[s.key];
    if (cap === null || cap === undefined) delete next.maxGW;
    else next.maxGW = cap;
    return next;
  });
  return { ...scenario, sources };
}

/** חוסר שנשאר בשנה אחת אחרי הבנייה (כל התקרות מוצו). */
export interface Shortfall {
  year: number;
  twh: number;
  peakGW: number;
}

/** התוצאה של idealSupply. */
export interface IdealResult {
  scenario: SupplyScenario;
  ranking: RankedSource[];
  /** GW חדשים לכל ערוץ בשנת האופק. */
  addedGW: Record<string, number>;
  /** ערוצים שהצי הקיים שלהם מושבת מוקדם. */
  retired: string[];
  /** שנים שבהן ההיצע עדיין לא מכסה את הביקוש (אנרגיה או שיא). */
  shortfall: Shortfall[];
  /** שנת ההתחלה בפועל של כל ערוץ שיש לו טווח שנים. */
  startYear: Record<string, number>;
}

/** סף זניח לחוסר (מעיגול). */
const SHORTFALL_EPS = 0.05;

/**
 * עקומת האספקה האידאלית: מתחילים מהצי הקיים (עם השבתה מוקדמת של ערוצים שהציון שלהם נמוך מהסף), ובונים
 * את כל ההספק החדש בהשלמה האוטומטית (autoFill) לפי הדירוג: פער האנרגיה לפי סדר הציון, ואחריו פער השיא,
 * קודם ממקורות יציבים, ובכל ערוץ רק משנת ההתחלה שלו (startYearsFor). ערוץ שמושבת נשאר בדירוג (בדרך כלל בסופו), ולכן נבנה מחדש רק אם הערוצים שמעליו לא מספיקים.
 * fillPriority של התוצאה הוא הדירוג (רק ערוצים מעל סף היישימות).
 */
export function idealSupply(
  demand: DemandTotal[],
  scenario: SupplyScenario,
  scoreOf: (key: string) => TrilemmaScore,
  opts: IdealOptions,
): IdealResult {
  const years = demand.map((d) => d.year);
  const baseYear = years[0] ?? new Date().getFullYear();
  const ranking = rankSources(scenario.sources, scoreOf, opts, baseYear);
  const retired = ranking.filter((r) => r.retiring).map((r) => r.key);
  const fleet = existingFleet(scenario, baseYear, new Set(retired), opts.retireByYear, opts.maxGW);
  const fillPriority = ranking.filter((r) => r.eligible).map((r) => r.key);
  const startYear = startYearsFor(opts.startYears ?? {}, opts.weights);
  const fill = autoFill(demand, { ...fleet, fillPriority }, { startYear });
  // ההשלמה עובדת בשנות עוגן; בין העוגנים יכול להישאר פער קטן, ומשלימים אותו שנה אחר שנה.
  const filled = topUpEveryYear(demand, fill.scenario, { startYear });
  const last = years[years.length - 1];
  const addedGW: Record<string, number> = {};
  for (const s of filled.sources) {
    const before = fleet.sources.find((f) => f.key === s.key)!;
    const add = sourceCapacity(s, last) - sourceCapacity(before, last);
    if (add > 0.005) addedGW[s.key] = add;
  }

  const supply = computeSupply(filled, years);
  const shortfall: Shortfall[] = [];
  for (const d of demand) {
    let twh = 0;
    let firm = 0;
    for (const p of supply) {
      if (p.year !== d.year) continue;
      twh += p.twh;
      firm += p.firmGW;
    }
    const gapTWh = d.twh - twh;
    const gapGW = d.peakGW - firm;
    if (gapTWh > SHORTFALL_EPS || gapGW > SHORTFALL_EPS) {
      shortfall.push({ year: d.year, twh: Math.max(0, gapTWh), peakGW: Math.max(0, gapGW) });
    }
  }
  return { scenario: filled, ranking, addedGW, retired, shortfall, startYear };
}

/** מדדי התמהיל בשנה אחת. */
export interface MixMetrics {
  year: number;
  /** ציוני הטרילמה והיישימות של התמהיל: ממוצע משוקלל באנרגיה. */
  score: TrilemmaScore;
  /** פליטות (מיליון טון CO₂eq). */
  mtCo2: number;
}

/**
 * מדדי התמהיל לכל שנה: ציון הטרילמה והיישימות (משוקללים ב-TWh; אגירה, בלי אנרגיה, לא נספרת) והפליטות.
 * שנה בלי ייצור מקבלת ציון 0.
 */
export function mixMetrics(points: SupplyPoint[], scoreOf: (key: string) => TrilemmaScore): MixMetrics[] {
  const byYear = new Map<number, { twh: number; mt: number; s: TrilemmaScore }>();
  for (const p of points) {
    const t = byYear.get(p.year) ?? {
      twh: 0,
      mt: 0,
      s: { security: 0, affordability: 0, sustainability: 0, feasibilityPct: 0 },
    };
    const sc = scoreOf(p.source);
    t.twh += p.twh;
    t.mt += sourceMtCo2(p.source, p.twh);
    t.s.security += sc.security * p.twh;
    t.s.affordability += sc.affordability * p.twh;
    t.s.sustainability += sc.sustainability * p.twh;
    t.s.feasibilityPct += sc.feasibilityPct * p.twh;
    byYear.set(p.year, t);
  }
  return [...byYear.entries()].map(([year, { twh, mt, s }]) => {
    const k = twh > 0 ? 1 / twh : 0;
    return {
      year,
      mtCo2: mt,
      score: {
        security: s.security * k,
        affordability: s.affordability * k,
        sustainability: s.sustainability * k,
        feasibilityPct: s.feasibilityPct * k,
      },
    };
  });
}

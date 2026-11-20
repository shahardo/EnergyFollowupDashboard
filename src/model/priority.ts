import type { SupplyScenario, SupplySource } from '../schema';
import type { DemandTotal } from './demand';
import { autoFill, topUpEveryYear } from './autofill';
import { factorOf, sourceCo2, type SourceFactor } from './fuel';
import { computeSupply, sourceCapacity, type SupplyPoint } from './supply';
import { TRILEMMA_AXES, type TrilemmaScore } from './trilemma';
import { J_PER_TWH, W_PER_GW } from './units';

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

/** הציון של ערוץ (0..10) לפי המשקלות: Σ משקל × ציון ציר, והיישימות (שבר) מומרת לסולם 0..10. */
export function meritScore(score: TrilemmaScore, w: PriorityWeights): number {
  const n = normalizeWeights(w);
  let sum = n.feasibility * (score.feasibility * 10);
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
  /** ערוץ שהיישימות שלו נמוכה מזה (שבר) לא נבנה מחדש. */
  minFeasibility: number;
  /** השבתה מוקדמת: הצי הקיים של ערוץ שהציון שלו נמוך מזה (0..10) יורד לאפס עד retireByYear. 0 = בלי השבתה. */
  retireBelow: number;
  /** השנה שבה הצי הקיים של ערוץ שמושבת מוקדם מגיע לאפס. */
  retireByYear: number;
  /** תקרת ההספק הכולל לכל ערוץ (W); null או חסר = בלי תקרה. גובר על maxPower של התרחיש. */
  maxPower: Record<string, number | null>;
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
  opts: Pick<IdealOptions, 'weights' | 'minFeasibility' | 'retireBelow'>,
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
        eligible: score.feasibility >= opts.minFeasibility,
        retiring: merit < opts.retireBelow && sourceCapacity(s, baseYear) > 0,
      };
    })
    .sort((a, b) => b.merit - a.merit || a.i - b.i)
    .map(({ key, merit, eligible, retiring }) => ({ key, merit, eligible, retiring }));
}

/**
 * הצי הקיים: לכל ערוץ, ההספק שלו בשנת הבסיס, קבוע עד retireYear שלו. ערוץ ב-retire יורד לינארית לאפס
 * עד retireByYear. התקרות (maxPower) מתחלפות בתקרות של הכלי.
 */
export function existingFleet(
  scenario: SupplyScenario,
  baseYear: number,
  retire: Set<string>,
  retireByYear: number,
  maxPower: Record<string, number | null>,
): SupplyScenario {
  const sources = scenario.sources.map((s) => {
    const w0 = sourceCapacity(s, baseYear);
    const capacity =
      retire.has(s.key) && w0 > 0
        ? retireByYear > baseYear
          ? [
              { year: baseYear, power: w0 },
              { year: retireByYear, power: 0 },
            ]
          : [{ year: baseYear, power: 0 }]
        : [{ year: baseYear, power: w0 }];
    // ערוץ בלי צי קיים מסומן כבוי: אם ההשלמה בונה בו, היא מפעילה אותו עם התוספת בלבד.
    const next: SupplySource = { ...s, enabled: w0 > 0, capacity };
    const cap = maxPower[s.key];
    if (cap === null || cap === undefined) delete next.maxPower;
    else next.maxPower = cap;
    return next;
  });
  return { ...scenario, sources };
}

/** חוסר שנשאר בשנה אחת אחרי הבנייה (כל התקרות מוצו): אנרגיה (J) ושיא (W). */
export interface Shortfall {
  year: number;
  energy: number;
  peak: number;
}

/** התוצאה של idealSupply. */
export interface IdealResult {
  scenario: SupplyScenario;
  ranking: RankedSource[];
  /** הספק חדש (W) לכל ערוץ בשנת האופק. */
  added: Record<string, number>;
  /** ערוצים שהצי הקיים שלהם מושבת מוקדם. */
  retired: string[];
  /** שנים שבהן ההיצע עדיין לא מכסה את הביקוש (אנרגיה או שיא). */
  shortfall: Shortfall[];
  /** שנת ההתחלה בפועל של כל ערוץ שיש לו טווח שנים. */
  startYear: Record<string, number>;
}

/** סף זניח לחוסר (מעיגול): 0.05 TWh ו-0.05 GW. */
const SHORTFALL_ENERGY_EPS = 0.05 * J_PER_TWH;
const SHORTFALL_POWER_EPS = 0.05 * W_PER_GW;

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
  const fleet = existingFleet(scenario, baseYear, new Set(retired), opts.retireByYear, opts.maxPower);
  const fillPriority = ranking.filter((r) => r.eligible).map((r) => r.key);
  const startYear = startYearsFor(opts.startYears ?? {}, opts.weights);
  const fill = autoFill(demand, { ...fleet, fillPriority }, { startYear });
  // ההשלמה עובדת בשנות עוגן; בין העוגנים יכול להישאר פער קטן, ומשלימים אותו שנה אחר שנה.
  const filled = topUpEveryYear(demand, fill.scenario, { startYear });
  const last = years[years.length - 1];
  const added: Record<string, number> = {};
  for (const s of filled.sources) {
    const before = fleet.sources.find((f) => f.key === s.key)!;
    const add = sourceCapacity(s, last) - sourceCapacity(before, last);
    if (add > 0.005 * W_PER_GW) added[s.key] = add;
  }

  const supply = computeSupply(filled, years);
  const shortfall: Shortfall[] = [];
  for (const d of demand) {
    let energy = 0;
    let firm = 0;
    for (const p of supply) {
      if (p.year !== d.year) continue;
      energy += p.energy;
      firm += p.firmPower;
    }
    const gapEnergy = d.energy - energy;
    const gapPower = d.peak - firm;
    if (gapEnergy > SHORTFALL_ENERGY_EPS || gapPower > SHORTFALL_POWER_EPS) {
      shortfall.push({ year: d.year, energy: Math.max(0, gapEnergy), peak: Math.max(0, gapPower) });
    }
  }
  return { scenario: filled, ranking, added, retired, shortfall, startYear };
}

/** מדדי התמהיל בשנה אחת. */
export interface MixMetrics {
  year: number;
  /** ציוני הטרילמה והיישימות של התמהיל: ממוצע משוקלל באנרגיה. */
  score: TrilemmaScore;
  /** פליטות (kg CO₂eq). */
  co2: number;
}

/**
 * מדדי התמהיל לכל שנה: ציון הטרילמה והיישימות (משוקללים באנרגיה; אגירה, בלי אנרגיה, לא נספרת) והפליטות.
 * שנה בלי ייצור מקבלת ציון 0. `factor`: מקדמי הפליטה לפי מפתח (factorsOf של התרחיש).
 */
export function mixMetrics(
  points: SupplyPoint[],
  scoreOf: (key: string) => TrilemmaScore,
  factor: (key: string) => SourceFactor = factorOf,
): MixMetrics[] {
  const byYear = new Map<number, { energy: number; co2: number; s: TrilemmaScore }>();
  for (const p of points) {
    const t = byYear.get(p.year) ?? {
      energy: 0,
      co2: 0,
      s: { security: 0, affordability: 0, sustainability: 0, feasibility: 0 },
    };
    const sc = scoreOf(p.source);
    t.energy += p.energy;
    t.co2 += sourceCo2(factor(p.source), p.energy);
    t.s.security += sc.security * p.energy;
    t.s.affordability += sc.affordability * p.energy;
    t.s.sustainability += sc.sustainability * p.energy;
    t.s.feasibility += sc.feasibility * p.energy;
    byYear.set(p.year, t);
  }
  return [...byYear.entries()].map(([year, { energy, co2, s }]) => {
    const k = energy > 0 ? 1 / energy : 0;
    return {
      year,
      co2,
      score: {
        security: s.security * k,
        affordability: s.affordability * k,
        sustainability: s.sustainability * k,
        feasibility: s.feasibility * k,
      },
    };
  });
}

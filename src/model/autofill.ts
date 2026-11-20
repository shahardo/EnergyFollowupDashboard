import type { CapacityPoint, SupplyScenario, SupplySource } from '../schema';
import type { DemandTotal } from './demand';
import { computeGap } from './gap';
import { roundUpPower } from './math';
import { computeSupply, interpolateCapacity, setCapacityAt, sourceCapacity, sourceEnergy } from './supply';
import { J_PER_TWH, SECONDS_PER_YEAR, W_PER_GW } from './units';

/** המרווח (בשנים) בין שנות העוגן של ההשלמה. */
export const AUTOFILL_STEP_YEARS = 5;

/**
 * פער השיא מכוסה קודם ממקורות "יציבים" (capacity credit של 0.5 לפחות: אגירה, גז, יבוא).
 * מקור עם credit נמוך (סולארי 0.05) היה צריך פי 20 הספק כדי לכסות אותו GW של שיא,
 * ולכן משתמשים בו לשיא רק אם אין מקור יציב פנוי.
 */
export const FIRM_CREDIT_MIN = 0.5;

/** סף זניח לאנרגיה (J) ולהספק (W) בהשלמה: 1e-9 TWh ו-1e-9 GW. */
const ENERGY_EPS = 1e-9 * J_PER_TWH;
const POWER_EPS = 1e-9 * W_PER_GW;
/** שינוי קטן מזה (W) לא מדווח כתוספת או הורדה: 0.005 GW. */
const REPORT_EPS = 0.005 * W_PER_GW;

/** התוצאה של autoFill: התרחיש המעודכן, והתוספת לכל מקור. */
export interface AutoFillResult {
  scenario: SupplyScenario;
  /** ההספק (W) שנוסף לכל מקור בשנה האחרונה של התקופה. */
  added: Record<string, number>;
}

/** אפשרויות של autoFill ו-topUpEveryYear. */
export interface AutoFillOptions {
  /** שנת התחלת האספקה לכל ערוץ: לפניה לא נבנה בו הספק חדש. ערוץ שלא מופיע: בלי מגבלה. */
  startYear?: Record<string, number>;
}

/** שנות העוגן של ההשלמה: כל 5 שנים משנת הבסיס, ושנת האופק. */
export function autoFillYears(years: number[]): number[] {
  if (years.length === 0) return [];
  const first = years[0];
  const last = years[years.length - 1];
  const out = years.filter((y) => (y - first) % AUTOFILL_STEP_YEARS === 0);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const isRetired = (s: SupplySource, year: number) => s.retireYear !== undefined && year >= s.retireYear;

// ── הצעד החמדני ──────────────────────────────────────────────────────────

/**
 * הצעד החמדני של ההשלמה בשנה אחת, משותף ל-autoFill ולסקריפט שבונה את התרחישים המוכנים:
 * קודם פער האנרגיה, לפי סדר priority (מקורות עם CF > 0); אחר כך פער השיא, קודם ממקורות
 * יציבים (FIRM_CREDIT_MIN) ורק אחריהם ממקורות עם credit נמוך.
 * `grow(s, wanted)` מוסיף עד wanted (W) למקור (לפי התקרה שלו) ומחזיר כמה נוסף בפועל.
 */
export function fillGreedy(
  priority: SupplySource[],
  energyGapJ: number,
  peakGapW: number,
  grow: (s: SupplySource, wanted: number) => number,
): void {
  let energyGap = energyGapJ;
  let peakGap = peakGapW;
  for (const s of priority) {
    if (energyGap <= ENERGY_EPS) break;
    if (s.capacityFactor <= 0) continue;
    const w = grow(s, energyGap / (s.capacityFactor * SECONDS_PER_YEAR));
    energyGap -= sourceEnergy(w, s.capacityFactor);
    peakGap -= w * s.capacityCredit;
  }
  const firm = priority.filter((s) => s.capacityCredit >= FIRM_CREDIT_MIN);
  const weak = priority.filter((s) => s.capacityCredit > 0 && s.capacityCredit < FIRM_CREDIT_MIN);
  for (const s of [...firm, ...weak]) {
    if (peakGap <= POWER_EPS) break;
    peakGap -= grow(s, peakGap / s.capacityCredit) * s.capacityCredit;
  }
}

// ── השלמה (autoFill) ─────────────────────────────────────────────────────

/**
 * מילוי חמדני של הפער לפי fillPriority.
 * בכל שנת עוגן: קודם מכסים את פער האנרגיה (מקורות עם CF > 0), ואחר כך את פער השיא:
 * קודם ממקורות יציבים (FIRM_CREDIT_MIN), ורק אחריהם משאר המקורות. כל מקור מוגבל ב-maxPower, אם הוגדר.
 * הספק שנבנה לא יורד: התוספת בשנת עוגן היא לפחות התוספת בשנת העוגן הקודמת.
 * מקור כבוי שקיבל תוספת מופעל, וההספק שלו הוא התוספת בלבד.
 * opts.startYear: לפני שנת ההתחלה של ערוץ לא נבנה בו הספק חדש (ההספק הקיים לא מושפע).
 */
export function autoFill(demand: DemandTotal[], scenario: SupplyScenario, opts: AutoFillOptions = {}): AutoFillResult {
  const startOf = (s: SupplySource) => opts.startYear?.[s.key] ?? -Infinity;
  const years = demand.map((d) => d.year);
  const anchors = autoFillYears(years);
  const byKey = new Map(scenario.sources.map((s) => [s.key, s]));
  const priority = scenario.fillPriority.map((k) => byKey.get(k)).filter((s): s is SupplySource => !!s);

  const added = new Map<string, number>(priority.map((s) => [s.key, 0]));
  const addedAt = new Map<string, CapacityPoint[]>(priority.map((s) => [s.key, []]));

  const byYear = new Map(demand.map((d) => [d.year, d]));
  for (const y of anchors) {
    const d = byYear.get(y);
    if (!d) continue;
    // אם ההספק הבסיסי של מקור עלה מאז העוגן הקודם, התוספת שנצברה מוגבלת כך שהסך לא יעבור את maxPower.
    for (const s of priority) {
      if (s.maxPower === undefined) continue;
      // sourceCapacity כבר מחזיר 0 למקור כבוי או שהוצא משימוש.
      const room = Math.max(0, s.maxPower - sourceCapacity(s, y));
      if ((added.get(s.key) ?? 0) > room) added.set(s.key, room);
    }
    const cap = (s: SupplySource) => (isRetired(s, y) ? 0 : sourceCapacity(s, y) + (added.get(s.key) ?? 0));

    const energyGap = d.energy - scenario.sources.reduce((sum, s) => sum + sourceEnergy(cap(s), s.capacityFactor), 0);
    const peakGap = d.peak - scenario.sources.reduce((sum, s) => sum + cap(s) * s.capacityCredit, 0);

    fillGreedy(priority, energyGap, peakGap, (s, wanted) => {
      if (isRetired(s, y) || y < startOf(s)) return 0;
      const room = s.maxPower === undefined ? Infinity : Math.max(0, s.maxPower - cap(s));
      const w = Math.min(wanted, room);
      if (w <= 0) return 0;
      added.set(s.key, (added.get(s.key) ?? 0) + w);
      return w;
    });
    for (const s of priority) addedAt.get(s.key)!.push({ year: y, power: added.get(s.key) ?? 0 });
  }

  // ערוץ עם שנת התחלה בין שתי שנות עוגן: התוספת היא 0 עד השנה שלפניה, כדי שהרמפה לא תתחיל לפני שנת ההתחלה.
  for (const s of priority) {
    const pts = addedAt.get(s.key)!;
    const zeroYear = startOf(s) - 1;
    if (zeroYear > (anchors[0] ?? Infinity) && !pts.some((p) => p.year === zeroYear)) {
      pts.push({ year: zeroYear, power: 0 });
      pts.sort((a, b) => a.year - b.year);
    }
  }

  const addedOut: Record<string, number> = {};
  const sources = scenario.sources.map((s) => {
    const points = addedAt.get(s.key);
    const total = added.get(s.key) ?? 0;
    if (!points || total <= POWER_EPS) return s;
    addedOut[s.key] = total;
    // מעגלים כלפי מעלה ל-0.01 GW, כדי שהעיגול לא ישאיר פער קטן.
    if (!s.enabled) {
      return { ...s, enabled: true, capacity: points.map((p) => ({ year: p.year, power: roundUpPower(p.power) })) };
    }
    const allYears = [...new Set([...s.capacity.map((p) => p.year), ...points.map((p) => p.year)])].sort(
      (a, b) => a - b,
    );
    return {
      ...s,
      capacity: allYears.map((year) => ({
        year,
        power: roundUpPower(interpolateCapacity(s.capacity, year) + interpolateCapacity(points, year)),
      })),
    };
  });

  return { scenario: { ...scenario, sources }, added: addedOut };
}

// ── התאמה (autoAdjust) ───────────────────────────────────────────────────

/** התוצאה של autoAdjust: כמו autoFill, ובנוסף ההקטנה. */
export interface AutoAdjustResult extends AutoFillResult {
  /** ההספק (W) שהורד מכל מקור בשנה האחרונה של התקופה (כשההיצע עלה על הביקוש). */
  removed: Record<string, number>;
  /** מקדם ההקטנה בכל שנת עוגן (1 = בלי הקטנה). */
  factors: { year: number; k: number }[];
}

/**
 * התאמה אוטומטית: קודם משלימים פער (autoFill), ואז, בכל שנת עוגן שבה ההיצע גבוה מהביקוש,
 * מקטינים את כל המקורות הפעילים באותו יחס k, עד שהאנרגיה תואמת לביקוש,
 * אבל לא מתחת ל-100% כיסוי שיא: k = max(ביקוש / היצע, שיא / הספק יציב), ולכל היותר 1.
 * בין שנות העוגן k עובר לינארית. מעגלים כלפי מעלה ל-0.01 GW, כדי שלא ייפתח פער.
 */
export function autoAdjust(demand: DemandTotal[], scenario: SupplyScenario): AutoAdjustResult {
  const filled = autoFill(demand, scenario);
  const years = demand.map((d) => d.year);
  const byYear = new Map(demand.map((d) => [d.year, d]));
  const anchors = autoFillYears(years);
  const factors = anchors.map((year) => {
    const d = byYear.get(year)!;
    let energy = 0;
    let firm = 0;
    for (const s of filled.scenario.sources) {
      const w = sourceCapacity(s, year);
      energy += sourceEnergy(w, s.capacityFactor);
      firm += w * s.capacityCredit;
    }
    if (energy <= d.energy + ENERGY_EPS) return { year, k: 1 };
    const k = Math.max(d.energy / energy, firm > 0 ? d.peak / firm : 1);
    // עודף זניח (למשל מהעיגול כלפי מעלה של ההשלמה) לא מצדיק שינוי.
    return { year, k: k > 0.999 ? 1 : k };
  });

  const removed: Record<string, number> = {};
  if (factors.every((f) => f.k === 1)) return { ...filled, removed, factors };

  // k בין שנות העוגן: אותה אינטרפולציה לינארית כמו של נקודות ההספק.
  const kPoints = factors.map((f) => ({ year: f.year, power: f.k }));
  const kAt = (year: number) => interpolateCapacity(kPoints, year);
  const last = years[years.length - 1];
  const sources = filled.scenario.sources.map((s) => {
    if (!s.enabled) return s;
    const allYears = [...new Set([...s.capacity.map((p) => p.year), ...anchors])].sort((a, b) => a - b);
    const capacity = allYears.map((year) => ({
      year,
      power: roundUpPower(interpolateCapacity(s.capacity, year) * kAt(year)),
    }));
    const r = sourceCapacity(s, last) - sourceCapacity({ ...s, capacity }, last);
    if (r > REPORT_EPS) removed[s.key] = r;
    return { ...s, capacity };
  });

  // תוספת והורדה לאותו מקור: מציגים רק את השינוי נטו.
  const added = { ...filled.added };
  for (const [k, r] of Object.entries(removed)) {
    if (added[k] === undefined) continue;
    const net = added[k] - r;
    delete added[k];
    delete removed[k];
    if (net > REPORT_EPS) added[k] = net;
    else if (net < -REPORT_EPS) removed[k] = -net;
  }
  return { scenario: { ...filled.scenario, sources }, added, removed, factors };
}

// ── השלמה שנתית ──────────────────────────────────────────────────────────

/**
 * ההשלמה מתאימה רק בשנות עוגן (כל 5 שנים). כאן משלימים כל שנה שנשאר בה פער, באותו צעד חמדני
 * כמו ההשלמה (fillGreedy), רק ממקורות פעילים, כל מקור עד ה-maxPower שלו.
 * התוספת היא נקודת הספק חדשה באותה שנה, מעל הקו, כך שהיא רק מגדילה את הכיסוי בשנים הסמוכות.
 */
export function topUpEveryYear(totals: DemandTotal[], s: SupplyScenario, opts: AutoFillOptions = {}): SupplyScenario {
  let cur = s;
  const first = totals[0]?.year ?? Infinity;
  for (const t of totals) {
    const g = computeGap([t], computeSupply(cur, [t.year]), cur)[0];
    const byKey = new Map(cur.sources.map((x) => [x.key, x]));
    const priority = cur.fillPriority.map((k) => byKey.get(k)).filter((x): x is SupplySource => !!x && x.enabled);
    fillGreedy(priority, g.gapEnergy, g.peakGap, (src, wanted) => {
      const start = opts.startYear?.[src.key] ?? -Infinity;
      if (t.year < start) return 0;
      const now = byKey.get(src.key)!;
      const w = sourceCapacity(now, t.year);
      const add = Math.min(wanted, Math.max(0, (src.maxPower ?? Infinity) - w));
      if (add <= POWER_EPS) return 0;
      // נקודה בשנה שלפני שנת ההתחלה, בערך הנוכחי: התוספת לא "דולפת" לשנים שלפניה.
      let points = now.capacity;
      if (start - 1 > first && start - 1 < t.year && !points.some((p) => p.year === start - 1)) {
        points = setCapacityAt(points, start - 1, interpolateCapacity(points, start - 1));
      }
      const next = { ...now, capacity: setCapacityAt(points, t.year, roundUpPower(w + add)) };
      byKey.set(src.key, next);
      cur = { ...cur, sources: cur.sources.map((x) => (x.key === src.key ? next : x)) };
      return add;
    });
  }
  return cur;
}

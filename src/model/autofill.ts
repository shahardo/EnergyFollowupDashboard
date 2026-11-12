import type { CapacityPoint, SupplyScenario, SupplySource } from '../schema';
import type { DemandTotal } from './demand';
import { computeGap } from './gap';
import { roundUp2 } from './math';
import { computeSupply, energyTWh, interpolateCapacity, setCapacityAt, sourceCapacity } from './supply';
import { HOURS_PER_YEAR_K } from './years';

/** המרווח (בשנים) בין שנות העוגן של ההשלמה. */
export const AUTOFILL_STEP_YEARS = 5;

/**
 * פער השיא מכוסה קודם ממקורות "יציבים" (capacity credit של 0.5 לפחות: אגירה, גז, יבוא).
 * מקור עם credit נמוך (סולארי 0.05) היה צריך פי 20 הספק כדי לכסות אותו GW של שיא,
 * ולכן משתמשים בו לשיא רק אם אין מקור יציב פנוי.
 */
export const FIRM_CREDIT_MIN = 0.5;

/** התוצאה של autoFill: התרחיש המעודכן, והתוספת לכל מקור. */
export interface AutoFillResult {
  scenario: SupplyScenario;
  /** ה-GW שנוספו לכל מקור בשנה האחרונה של התקופה. */
  addedGW: Record<string, number>;
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
 * `grow(s, wantedGW)` מוסיף עד wantedGW למקור (לפי התקרה שלו) ומחזיר כמה נוסף בפועל.
 */
export function fillGreedy(
  priority: SupplySource[],
  energyGapTWh: number,
  peakGapGW: number,
  grow: (s: SupplySource, wantedGW: number) => number,
): void {
  let energyGap = energyGapTWh;
  let peakGap = peakGapGW;
  for (const s of priority) {
    if (energyGap <= 1e-9) break;
    if (s.capacityFactor <= 0) continue;
    const gw = grow(s, energyGap / (s.capacityFactor * HOURS_PER_YEAR_K));
    energyGap -= energyTWh(gw, s.capacityFactor);
    peakGap -= gw * s.capacityCredit;
  }
  const firm = priority.filter((s) => s.capacityCredit >= FIRM_CREDIT_MIN);
  const weak = priority.filter((s) => s.capacityCredit > 0 && s.capacityCredit < FIRM_CREDIT_MIN);
  for (const s of [...firm, ...weak]) {
    if (peakGap <= 1e-9) break;
    peakGap -= grow(s, peakGap / s.capacityCredit) * s.capacityCredit;
  }
}

// ── השלמה (autoFill) ─────────────────────────────────────────────────────

/**
 * מילוי חמדני של הפער לפי fillPriority.
 * בכל שנת עוגן: קודם מכסים את פער האנרגיה (מקורות עם CF > 0), ואחר כך את פער השיא:
 * קודם ממקורות יציבים (FIRM_CREDIT_MIN), ורק אחריהם משאר המקורות. כל מקור מוגבל ב-maxGW, אם הוגדר.
 * הספק שנבנה לא יורד: התוספת בשנת עוגן היא לפחות התוספת בשנת העוגן הקודמת.
 * מקור כבוי שקיבל תוספת מופעל, וההספק שלו הוא התוספת בלבד.
 */
export function autoFill(demand: DemandTotal[], scenario: SupplyScenario): AutoFillResult {
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
    // אם ההספק הבסיסי של מקור עלה מאז העוגן הקודם, התוספת שנצברה מוגבלת כך שהסך לא יעבור את maxGW.
    for (const s of priority) {
      if (s.maxGW === undefined) continue;
      // sourceCapacity כבר מחזיר 0 למקור כבוי או שהוצא משימוש.
      const room = Math.max(0, s.maxGW - sourceCapacity(s, y));
      if ((added.get(s.key) ?? 0) > room) added.set(s.key, room);
    }
    const cap = (s: SupplySource) => (isRetired(s, y) ? 0 : sourceCapacity(s, y) + (added.get(s.key) ?? 0));

    const energyGap = d.twh - scenario.sources.reduce((sum, s) => sum + energyTWh(cap(s), s.capacityFactor), 0);
    const peakGap = d.peakGW - scenario.sources.reduce((sum, s) => sum + cap(s) * s.capacityCredit, 0);

    fillGreedy(priority, energyGap, peakGap, (s, wanted) => {
      if (isRetired(s, y)) return 0;
      const room = s.maxGW === undefined ? Infinity : Math.max(0, s.maxGW - cap(s));
      const gw = Math.min(wanted, room);
      if (gw <= 0) return 0;
      added.set(s.key, (added.get(s.key) ?? 0) + gw);
      return gw;
    });
    for (const s of priority) addedAt.get(s.key)!.push({ year: y, gw: added.get(s.key) ?? 0 });
  }

  const addedGW: Record<string, number> = {};
  const sources = scenario.sources.map((s) => {
    const points = addedAt.get(s.key);
    const total = added.get(s.key) ?? 0;
    if (!points || total <= 1e-9) return s;
    addedGW[s.key] = total;
    // מעגלים כלפי מעלה ל-0.01 GW, כדי שהעיגול לא ישאיר פער קטן.
    if (!s.enabled) {
      return { ...s, enabled: true, capacityGW: points.map((p) => ({ year: p.year, gw: roundUp2(p.gw) })) };
    }
    const allYears = [...new Set([...s.capacityGW.map((p) => p.year), ...points.map((p) => p.year)])].sort(
      (a, b) => a - b,
    );
    return {
      ...s,
      capacityGW: allYears.map((year) => ({
        year,
        gw: roundUp2(interpolateCapacity(s.capacityGW, year) + interpolateCapacity(points, year)),
      })),
    };
  });

  return { scenario: { ...scenario, sources }, addedGW };
}

// ── התאמה (autoAdjust) ───────────────────────────────────────────────────

/** התוצאה של autoAdjust: כמו autoFill, ובנוסף ההקטנה. */
export interface AutoAdjustResult extends AutoFillResult {
  /** ה-GW שהורדו מכל מקור בשנה האחרונה של התקופה (כשההיצע עלה על הביקוש). */
  removedGW: Record<string, number>;
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
    let twh = 0;
    let firm = 0;
    for (const s of filled.scenario.sources) {
      const gw = sourceCapacity(s, year);
      twh += energyTWh(gw, s.capacityFactor);
      firm += gw * s.capacityCredit;
    }
    if (twh <= d.twh + 1e-9) return { year, k: 1 };
    const k = Math.max(d.twh / twh, firm > 0 ? d.peakGW / firm : 1);
    // עודף זניח (למשל מהעיגול כלפי מעלה של ההשלמה) לא מצדיק שינוי.
    return { year, k: k > 0.999 ? 1 : k };
  });

  const removedGW: Record<string, number> = {};
  if (factors.every((f) => f.k === 1)) return { ...filled, removedGW, factors };

  // k בין שנות העוגן: אותה אינטרפולציה לינארית כמו של נקודות ההספק.
  const kPoints = factors.map((f) => ({ year: f.year, gw: f.k }));
  const kAt = (year: number) => interpolateCapacity(kPoints, year);
  const last = years[years.length - 1];
  const sources = filled.scenario.sources.map((s) => {
    if (!s.enabled) return s;
    const allYears = [...new Set([...s.capacityGW.map((p) => p.year), ...anchors])].sort((a, b) => a - b);
    const capacityGW = allYears.map((year) => ({
      year,
      gw: roundUp2(interpolateCapacity(s.capacityGW, year) * kAt(year)),
    }));
    const removed = sourceCapacity(s, last) - sourceCapacity({ ...s, capacityGW }, last);
    if (removed > 0.005) removedGW[s.key] = removed;
    return { ...s, capacityGW };
  });

  // תוספת והורדה לאותו מקור: מציגים רק את השינוי נטו.
  const addedGW = { ...filled.addedGW };
  for (const [k, r] of Object.entries(removedGW)) {
    if (addedGW[k] === undefined) continue;
    const net = addedGW[k] - r;
    delete addedGW[k];
    delete removedGW[k];
    if (net > 0.005) addedGW[k] = net;
    else if (net < -0.005) removedGW[k] = -net;
  }
  return { scenario: { ...filled.scenario, sources }, addedGW, removedGW, factors };
}

// ── השלמה שנתית ──────────────────────────────────────────────────────────

/**
 * ההשלמה מתאימה רק בשנות עוגן (כל 5 שנים). כאן משלימים כל שנה שנשאר בה פער, באותו צעד חמדני
 * כמו ההשלמה (fillGreedy), רק ממקורות פעילים, כל מקור עד ה-maxGW שלו.
 * התוספת היא נקודת הספק חדשה באותה שנה, מעל הקו, כך שהיא רק מגדילה את הכיסוי בשנים הסמוכות.
 */
export function topUpEveryYear(totals: DemandTotal[], s: SupplyScenario): SupplyScenario {
  let cur = s;
  for (const t of totals) {
    const g = computeGap([t], computeSupply(cur, [t.year]), cur)[0];
    const byKey = new Map(cur.sources.map((x) => [x.key, x]));
    const priority = cur.fillPriority.map((k) => byKey.get(k)).filter((x): x is SupplySource => !!x && x.enabled);
    fillGreedy(priority, g.gapTWh, g.peakGapGW, (src, wanted) => {
      const now = byKey.get(src.key)!;
      const gw = sourceCapacity(now, t.year);
      const add = Math.min(wanted, Math.max(0, (src.maxGW ?? Infinity) - gw));
      if (add <= 1e-9) return 0;
      const next = { ...now, capacityGW: setCapacityAt(now.capacityGW, t.year, roundUp2(gw + add)) };
      byKey.set(src.key, next);
      cur = { ...cur, sources: cur.sources.map((x) => (x.key === src.key ? next : x)) };
      return add;
    });
  }
  return cur;
}

import { ProjectStatusSchema, type Project, type ProjectStatus, type SupplyScenario } from '../schema';
import { linearShare } from './math';
import { sourceCapacity } from './supply';

const DAY = 86_400_000;

/** 'YYYY-MM-DD' → מילישניות UTC. */
export const parseDate = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
/** מילישניות UTC → 'YYYY-MM-DD'. */
export const formatDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** כל הסטטוסים, בסדר התצוגה (מקרא, סינון, עורך). */
export const PROJECT_STATUSES: readonly ProjectStatus[] = ProjectStatusSchema.options;

/** פער (שבר) בין ההתקדמות בפועל לצפויה, שעד אליו הפרויקט "בזמן". */
export const ON_TRACK_TOLERANCE = 0.1;
/** פער שעד אליו הפרויקט "בסיכון". מעבר לו: "מתעכב". */
export const AT_RISK_TOLERANCE = 0.25;

/** ההתקדמות הצפויה (0..1) לפי הזמן שעבר מתחילת הפרויקט. */
export function expectedProgress(p: Project, asOf: string): number {
  const start = parseDate(p.plannedStart);
  const end = parseDate(p.plannedEnd);
  return linearShare(parseDate(asOf), start, end);
}

/** הסטטוס לפי ההתקדמות מול הצפוי (ON_TRACK_TOLERANCE / AT_RISK_TOLERANCE). משימה שהושלמה תמיד בזמן. */
export function computedStatus(p: Project, asOf: string): ProjectStatus {
  if (p.progress >= 1) return 'on-track';
  const delta = p.progress - expectedProgress(p, asOf);
  if (delta >= -ON_TRACK_TOLERANCE) return 'on-track';
  if (delta >= -AT_RISK_TOLERANCE) return 'at-risk';
  return 'delayed';
}

/** סטטוס מפורש גובר על החישוב. */
export function projectStatus(p: Project, asOf: string): ProjectStatus {
  return p.status ?? computedStatus(p, asOf);
}

/**
 * תאריך הסיום הצפוי, במילישניות.
 * אם הפרויקט מפגר, ממשיכים את קצב העבודה עד עכשיו: start + elapsed / progress.
 * לעולם לא לפני הסיום המתוכנן. בלי התקדמות אחרי שההתחלה עברה, אי אפשר להעריך: null.
 */
export function projectedEnd(p: Project, asOf: string): number | null {
  const start = parseDate(p.plannedStart);
  const end = parseDate(p.plannedEnd);
  const now = parseDate(asOf);
  if (p.progress >= 1) return Math.min(end, now);
  if (now <= start) return end;
  if (p.progress <= 0) return now > start + 30 * DAY ? null : end;
  const extrapolated = start + (now - start) / p.progress;
  return Math.max(end, extrapolated);
}

/**
 * מחלק את המשימות של כל ערוץ לנתיבים, כך שמשימות חופפות בזמן לא יוצגו באותה שורה.
 * כל משימה נכנסת לנתיב הראשון שהמשימה האחרונה בו הסתיימה עד תחילתה (נגיעה אינה חפיפה).
 * הסוף נלקח מהסיום הצפוי כשהוא מאוחר מהמתוכנן, כדי שהפס המקווקו לא יתנגש במשימה הבאה.
 */
export function assignLanes(tasks: Project[], asOf: string): Map<string, number> {
  const out = new Map<string, number>();
  const byChannel = new Map<string, Project[]>();
  for (const t of tasks) {
    const list = byChannel.get(t.channel);
    if (list) list.push(t);
    else byChannel.set(t.channel, [t]);
  }
  for (const list of byChannel.values()) {
    const sorted = list.sort(
      (a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.plannedEnd.localeCompare(b.plannedEnd),
    );
    const laneEnds: number[] = [];
    for (const t of sorted) {
      const start = parseDate(t.plannedStart);
      const end = Math.max(parseDate(t.plannedEnd), projectedEnd(t, asOf) ?? 0);
      let lane = laneEnds.findIndex((e) => e <= start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = end;
      out.set(t.id, lane);
    }
  }
  return out;
}

/** התקדמות הערוץ (שבר): ממוצע ההתקדמות של המשימות, משוקלל במשך כל משימה. null כשאין משימות. */
export function channelProgress(tasks: Project[], channel: string): number | null {
  let w = 0;
  let sum = 0;
  for (const t of tasks) {
    if (t.channel !== channel) continue;
    const d = Math.max(DAY, parseDate(t.plannedEnd) - parseDate(t.plannedStart));
    w += d;
    sum += d * t.progress;
  }
  return w > 0 ? sum / w : null;
}

/** המשימות שמתוכננות להסתיים עד סוף שנת הייחוס (כולל). */
export function tasksDueBy(tasks: Project[], year: number): Project[] {
  const last = `${year}-12-31`;
  return tasks.filter((t) => t.plannedEnd <= last);
}

/** ההספק החדש (W) שתרחיש ההיצע דורש בכל ערוץ: ההספק בשנת היעד פחות ההספק בשנת הבסיס. */
export function channelTargets(supply: SupplyScenario, baseYear: number, targetYear: number): Record<string, number> {
  const out: Record<string, number> = {};
  // מקור כבוי, או שיוצא משימוש עד שנת היעד, לא צריך הספק חדש.
  for (const s of supply.sources) {
    out[s.key] = Math.max(0, sourceCapacity(s, targetYear) - sourceCapacity(s, baseYear));
  }
  return out;
}

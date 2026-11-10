import type { Project, ProjectStatus, SupplyScenario } from '../schema';
import { sourceCapacity } from './supply';

const DAY = 86_400_000;

/** 'YYYY-MM-DD' → מילישניות UTC. */
export const parseDate = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const formatDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const yearOf = (ms: number) => new Date(ms).getUTCFullYear();

/** פער (באחוזים) בין ההתקדמות בפועל לצפויה, שעד אליו הפרויקט "בזמן". */
export const ON_TRACK_TOLERANCE = 10;
/** פער שעד אליו הפרויקט "בסיכון". מעבר לו: "מתעכב". */
export const AT_RISK_TOLERANCE = 25;

/** ההתקדמות הצפויה (0..100) לפי הזמן שעבר מתחילת הפרויקט. */
export function expectedProgress(p: Project, asOf: string): number {
  const start = parseDate(p.plannedStart);
  const end = parseDate(p.plannedEnd);
  const now = parseDate(asOf);
  if (end <= start) return now >= end ? 100 : 0;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

export function computedStatus(p: Project, asOf: string): ProjectStatus {
  if (p.progressPct >= 100) return 'on-track';
  const delta = p.progressPct - expectedProgress(p, asOf);
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
 * אם הפרויקט מפגר, ממשיכים את קצב העבודה עד עכשיו: start + elapsed × 100 / progress.
 * לעולם לא לפני הסיום המתוכנן. בלי התקדמות אחרי שההתחלה עברה, אי אפשר להעריך: null.
 */
export function projectedEnd(p: Project, asOf: string): number | null {
  const start = parseDate(p.plannedStart);
  const end = parseDate(p.plannedEnd);
  const now = parseDate(asOf);
  if (p.progressPct >= 100) return Math.min(end, now);
  if (now <= start) return end;
  if (p.progressPct <= 0) return now > start + 30 * DAY ? null : end;
  const extrapolated = start + ((now - start) * 100) / p.progressPct;
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
  for (const t of tasks) byChannel.set(t.channel, [...(byChannel.get(t.channel) ?? []), t]);
  for (const list of byChannel.values()) {
    const sorted = [...list].sort(
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

/** התקדמות הערוץ: ממוצע אחוזי הביצוע של המשימות, משוקלל במשך כל משימה. null כשאין משימות. */
export function channelProgress(tasks: Project[], channel: string): number | null {
  let w = 0;
  let sum = 0;
  for (const t of tasks) {
    if (t.channel !== channel) continue;
    const d = Math.max(DAY, parseDate(t.plannedEnd) - parseDate(t.plannedStart));
    w += d;
    sum += d * t.progressPct;
  }
  return w > 0 ? sum / w : null;
}

/** ה-GW החדשים שתרחיש ההיצע דורש בכל ערוץ: ההספק בשנת היעד פחות ההספק בשנת הבסיס. */
export function channelTargets(supply: SupplyScenario, baseYear: number, targetYear: number): Record<string, number> {
  const out: Record<string, number> = {};
  // מקור כבוי, או שיוצא משימוש עד שנת היעד, לא צריך הספק חדש.
  for (const s of supply.sources) {
    out[s.key] = Math.max(0, sourceCapacity(s, targetYear) - sourceCapacity(s, baseYear));
  }
  return out;
}

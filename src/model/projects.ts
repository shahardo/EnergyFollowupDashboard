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

/** סכום ה-GW של הפרויקטים בערוץ שצפויים להסתיים עד סוף השנה הזו. */
export function projectsToCapacity(projects: Project[], channel: string, year: number, asOf: string): number {
  return projects
    .filter((p) => p.channel === channel)
    .reduce((sum, p) => {
      const e = projectedEnd(p, asOf);
      return e !== null && yearOf(e) <= year ? sum + p.mw / 1000 : sum;
    }, 0);
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

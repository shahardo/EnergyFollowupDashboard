/**
 * הלקוח של שרת ה-Python (backend/api). השרת אופציונלי: כשהוא לא זמין (GitHub Pages, ה-Artifact) הדשבורד
 * עובד כולו בדפדפן, וטאב האופטימיזציה מוסתר. הכתובת: VITE_API_URL אם הוגדרה בבנייה, אחרת אותו מקור (כשהאתר
 * מוגש מהשרת, למשל ב-Hugging Face Space).
 */
import type { DemandScenario, SupplyScenario } from '../schema';
import type { AutoAdjustResult } from '../model/autofill';

/** הכתובת של השרת (ריקה = אותו מקור). */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** מצב השרת. */
export interface Health {
  status: 'ok';
  version: string;
  osemosys: { model: string; solver: string };
  stateMirror: boolean;
  tokenRequired: boolean;
  maxActiveRuns: number;
}

/** התרחיש השמור בשרת (בלי התוכן). */
export interface ScenarioMeta {
  id: string;
  kind: 'demand' | 'supply' | 'projects';
  name: string;
  savedAt: string;
  storedAt: string;
}

/** מצבי ההרצה. */
export type RunMode = 'free' | 'capped' | 'follow';
/** מצב של הרצה. */
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** הרצת OSeMOSYS. */
export interface Run {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  seconds?: number;
  error?: string;
  queuePosition?: number | null;
  log?: string;
  runMode?: RunMode;
}

/** התוצאה של הרצה, במונחי הדשבורד וביחידות SI (W, J, kg, $). */
export interface RunResult {
  status: 'optimal';
  seconds: number;
  years: number[];
  /** הספק מותקן (W) לכל מקור ושנה. */
  capacity: { year: number; source: string; power: number }[];
  /** ייצור חשמל ומימן, ויבוא הדלקים שלו (J), לכל מקור ושנה. */
  production: { year: number; source: string; electricity: number; hydrogen: number; fuelImport: number }[];
  /** האנרגיה הסופית (J) שכל מגזר (סחורת ביקוש) צורך מכל נשא, כפי שהמודל בחר. */
  endUse?: { year: number; commodity: string; carrier: 'electricity' | 'fuels' | 'gas'; energy: number }[];
  /** פליטות CO₂ (kg) בכל שנה. */
  emissions: { year: number; co2: number }[];
  /** עלות מהוונת ($) בכל שנה. */
  cost: { year: number; discountedCost: number }[];
  /** העלות המהוונת הכוללת ($). */
  objective: number;
}

/** שגיאת שרת, עם הקוד שלה. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** זמן ההמתנה לבדיקת השרת, וכמה ניסיונות (שרת שישן מתעורר לאט). */
const HEALTH_TIMEOUT_MS = 25_000;
const HEALTH_ATTEMPTS = 2;
/** זמן ההמתנה לשליחת הרצה: ארוך מהגבלת הזמן של הפותר בשרת (30 דקות). */
const SUBMIT_TIMEOUT_MS = 35 * 60_000;

let token: string | null = null;
/** טוקן ההרצה (כשהשרת דורש אותו לכתיבה). */
export const setApiToken = (t: string | null) => {
  token = t;
};

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'X-Run-Token': token } : {}),
        ...init.headers,
      },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, typeof body?.detail === 'string' ? body.detail : res.statusText);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T>(path: string, body: unknown, timeoutMs?: number) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs);

/** הפעולות של השרת. */
export const api = {
  /**
   * האם השרת חי (null אם לא זמין או שזה לא השרת שלנו). זמן ארוך וניסיון נוסף: שרת שישן (Cloud Run) מתעורר
   * תוך כמה עשרות שניות; בלי שרת (GitHub Pages) התשובה 404 מגיעה מיד ואין המתנה.
   */
  health: async (): Promise<Health | null> => {
    for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt++) {
      try {
        const h = await call<Health>('/api/health', {}, HEALTH_TIMEOUT_MS);
        return h?.status === 'ok' ? h : null;
      } catch (e) {
        if (e instanceof ApiError) return null; // השרת ענה, ואין כאן API
      }
    }
    return null;
  },
  /** התאמה אוטומטית בשרת (אותה תוצאה כמו autoAdjust בדפדפן). */
  autoAdjust: (demand: DemandScenario, supply: SupplyScenario) =>
    post<AutoAdjustResult>('/api/auto-adjust', { demand, supply }),
  listScenarios: () => call<ScenarioMeta[]>('/api/scenarios'),
  getScenario: (id: string) => call<unknown>(`/api/scenarios/${encodeURIComponent(id)}`),
  saveScenario: (file: unknown) => post<ScenarioMeta>('/api/scenarios', file),
  deleteScenario: (id: string) => call<unknown>(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** שליחת הרצה; בשרת עם RUN_IN_REQUEST התשובה מגיעה רק כשההרצה הסתיימה. */
  submitRun: (req: { demand: DemandScenario; supply: SupplyScenario; runMode: RunMode }) =>
    post<Run>('/api/osemosys/runs', req, SUBMIT_TIMEOUT_MS),
  listRuns: () => call<Run[]>('/api/osemosys/runs'),
  getRun: (id: string) => call<Run>(`/api/osemosys/runs/${encodeURIComponent(id)}`),
  getResult: (id: string) => call<RunResult>(`/api/osemosys/runs/${encodeURIComponent(id)}/result`),
  cancelRun: (id: string) => call<unknown>(`/api/osemosys/runs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

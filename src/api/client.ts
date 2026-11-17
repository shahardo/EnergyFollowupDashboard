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
  osemosys: { repo: string; commit: string };
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
/** מקור הביקוש להרצה. */
export type DemandSource = 'dashboard' | 'model';
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
  demandSource?: DemandSource;
}

/** התוצאה של הרצה, במונחי הדשבורד. */
export interface RunResult {
  status: 'optimal';
  seconds: number;
  years: number[];
  capacity: { year: number; source: string; gw: number }[];
  production: { year: number; source: string; electricityTWh: number; hydrogenTWh: number; fuelImportTWh: number }[];
  emissions: { year: number; mtCo2: number }[];
  cost: { year: number; discountedCost: number }[];
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
  /** האם השרת חי (null אם לא זמין או שזה לא השרת שלנו). */
  health: async (): Promise<Health | null> => {
    try {
      const h = await call<Health>('/api/health', {}, 4000);
      return h?.status === 'ok' ? h : null;
    } catch {
      return null;
    }
  },
  /** התאמה אוטומטית בשרת (אותה תוצאה כמו autoAdjust בדפדפן). */
  autoAdjust: (demand: DemandScenario, supply: SupplyScenario) =>
    post<AutoAdjustResult>('/api/auto-adjust', { demand, supply }),
  listScenarios: () => call<ScenarioMeta[]>('/api/scenarios'),
  getScenario: (id: string) => call<unknown>(`/api/scenarios/${encodeURIComponent(id)}`),
  saveScenario: (file: unknown) => post<ScenarioMeta>('/api/scenarios', file),
  deleteScenario: (id: string) => call<unknown>(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  submitRun: (req: { demand: DemandScenario; supply: SupplyScenario; runMode: RunMode; demandSource: DemandSource }) =>
    post<Run>('/api/osemosys/runs', req),
  listRuns: () => call<Run[]>('/api/osemosys/runs'),
  getRun: (id: string) => call<Run>(`/api/osemosys/runs/${encodeURIComponent(id)}`),
  getResult: (id: string) => call<RunResult>(`/api/osemosys/runs/${encodeURIComponent(id)}/result`),
  cancelRun: (id: string) => call<unknown>(`/api/osemosys/runs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

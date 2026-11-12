import { fileOpen, fileSave, type FileWithHandle } from 'browser-fs-access';
import {
  DemandFileSchema,
  SCHEMA_VERSION,
  ProjectsFileSchema,
  SupplyFileSchema,
  type DemandScenario,
  type ScenarioKind,
  type ProjectsData,
  type SupplyScenario,
} from '../schema';

type Handle = FileSystemFileHandle | null;

/** ה-handle של הקובץ האחרון שנפתח או נשמר, לכל סוג. רק בכרום ובאדג'. לא נשמר ב-localStorage. */
const handles: Record<ScenarioKind, Handle> = { demand: null, supply: null, projects: null };

/** שוכח את הקובץ של סוג מסוים (אחרי שכפול או איפוס), כך ש"שמור" הבא ישאל איפה לשמור. */
export const clearHandle = (kind: ScenarioKind) => {
  handles[kind] = null;
};

/** ביטול של המשתמש בבוחר קבצים (לא שגיאה שצריך להציג). */
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** שם קובץ בלי התווים שאסורים במערכות קבצים; fallback כשלא נשאר כלום. */
export const safeFileStem = (name: string, fallback = 'export') =>
  name.replace(/[\\/:*?"<>|]+/g, '-').trim() || fallback;

/**
 * בתוך iframe (למשל כ-Artifact ב-claude.ai) הדפדפן חוסם הורדות ואת File System Access API.
 * שם "שמור" מציג את ה-JSON להעתקה, ו"פתח" משתמש ב-<input type="file">, שעובד בכל מקום.
 */
export const isEmbedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const extensionOf = (kind: ScenarioKind) => `.${kind}.json`;

/** שם הקובץ המוצע לשמירת תרחיש: השם שלו והסיומת של הסוג (למשל ‎.demand.json). */
export const safeFileName = (name: string, kind: ScenarioKind) =>
  `${safeFileStem(name, 'scenario')}${extensionOf(kind)}`;

/** התוכן של קובץ שמור מכל סוג. */
export type ScenarioData = DemandScenario | SupplyScenario | ProjectsData;

/** הטקסט של קובץ שמור: המעטפת (גרסה, סוג, זמן שמירה) והנתונים, JSON מעוצב. */
export function serialize(kind: ScenarioKind, data: ScenarioData): string {
  return JSON.stringify({ schema: SCHEMA_VERSION, kind, savedAt: new Date().toISOString(), data }, null, 2);
}

/** "שמור" משתמש ב-handle הקיים אם יש; "שמור בשם" (saveAs = true) תמיד פותח בוחר קבצים. */
export async function saveScenario(kind: ScenarioKind, data: ScenarioData, saveAs: boolean): Promise<void> {
  const blob = new Blob([serialize(kind, data)], { type: 'application/json' });
  const handle = await fileSave(
    blob,
    { fileName: safeFileName(data.name, kind), extensions: [extensionOf(kind), '.json'] },
    saveAs ? null : handles[kind],
  );
  handles[kind] = handle ?? null;
}

/** קובץ שנבדק: הסוג והנתונים. */
export type ParsedFile =
  | { kind: 'demand'; data: DemandScenario }
  | { kind: 'supply'; data: SupplyScenario }
  | { kind: 'projects'; data: ProjectsData };

/** שגיאה בקובץ (JSON לא תקין, גרסה או נתונים), עם הודעה בעברית. */
export class ScenarioFileError extends Error {}

const FILE_SCHEMAS = { demand: DemandFileSchema, supply: SupplyFileSchema, projects: ProjectsFileSchema } as const;

/** בודק את תוכן הקובץ עם Zod ומחזיר את סוגו. זורק ScenarioFileError עם הודעה בעברית. */
export function parseScenarioText(text: string): ParsedFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ScenarioFileError('הקובץ אינו JSON תקין.');
  }
  const kind = (json as { kind?: unknown })?.kind;
  const schema = (json as { schema?: unknown })?.schema;
  if (schema !== SCHEMA_VERSION) {
    throw new ScenarioFileError(`גרסת הקובץ לא נתמכת (${String(schema)}). הגרסה הנתמכת: ${SCHEMA_VERSION}.`);
  }
  if (kind === 'demand' || kind === 'supply' || kind === 'projects') {
    const r = FILE_SCHEMAS[kind].safeParse(json);
    if (r.success) return { kind, data: r.data.data } as ParsedFile;
    throw new ScenarioFileError(describe(r.error));
  }
  throw new ScenarioFileError(`סוג קובץ לא מוכר: ${String(kind)}. צפוי demand, supply או projects.`);
}

/** ההודעה של הבעיה הראשונה שנמצאה, עם הנתיב שלה בקובץ. */
function describe(error: import('zod').ZodError): string {
  const first = error.issues[0];
  return `הקובץ לא תקין: ${first.path.join('.') || '(שורש)'}: ${first.message}`;
}

/** rememberHandle = false כשטוענים קובץ להשוואה, כדי ש"שמור" ימשיך לשמור לקובץ של התרחיש הפעיל. */
export async function readScenarioFile(file: File | FileWithHandle, rememberHandle = true): Promise<ParsedFile> {
  const parsed = parseScenarioText(await file.text());
  if (rememberHandle) handles[parsed.kind] = (file as FileWithHandle).handle ?? null;
  return parsed;
}

/** בחירת קובץ דרך <input type="file">, בלי File System Access API. */
function pickFileWithInput(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new DOMException('No file selected', 'AbortError'));
    });
    input.addEventListener('cancel', () => reject(new DOMException('Cancelled', 'AbortError')));
    input.click();
  });
}

/** פותח קובץ תרחיש: בוחר הקבצים של הדפדפן, או <input type="file"> בתוך iframe. */
export async function openScenario(rememberHandle = true): Promise<ParsedFile> {
  if (isEmbedded) return readScenarioFile(await pickFileWithInput(), rememberHandle);
  const file = await fileOpen({
    extensions: ['.json'],
    mimeTypes: ['application/json'],
    description: 'קובץ תרחיש',
  });
  return readScenarioFile(file, rememberHandle);
}

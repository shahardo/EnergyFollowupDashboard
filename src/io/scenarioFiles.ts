import { fileOpen, fileSave, type FileWithHandle } from 'browser-fs-access';
import {
  DemandFileSchema,
  SCHEMA_VERSION,
  SupplyFileSchema,
  type DemandScenario,
  type ScenarioKind,
  type SupplyScenario,
} from '../schema';

type Handle = FileSystemFileHandle | null;

/** ה-handle של הקובץ האחרון שנפתח או נשמר, לכל סוג. רק בכרום ובאדג'. לא נשמר ב-localStorage. */
const handles: Record<ScenarioKind, Handle> = { demand: null, supply: null };

export const clearHandle = (kind: ScenarioKind) => {
  handles[kind] = null;
};
export const hasHandle = (kind: ScenarioKind) => handles[kind] !== null;

const extensionOf = (kind: ScenarioKind) => `.${kind}.json`;

const safeFileName = (name: string, kind: ScenarioKind) =>
  `${name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'scenario'}${extensionOf(kind)}`;

export function serialize(kind: ScenarioKind, data: DemandScenario | SupplyScenario): string {
  return JSON.stringify({ schema: SCHEMA_VERSION, kind, savedAt: new Date().toISOString(), data }, null, 2);
}

/** "שמור" משתמש ב-handle הקיים אם יש; "שמור בשם" (saveAs = true) תמיד פותח בוחר קבצים. */
export async function saveScenario(
  kind: ScenarioKind,
  data: DemandScenario | SupplyScenario,
  saveAs: boolean,
): Promise<void> {
  const blob = new Blob([serialize(kind, data)], { type: 'application/json' });
  const handle = await fileSave(
    blob,
    { fileName: safeFileName(data.name, kind), extensions: [extensionOf(kind), '.json'] },
    saveAs ? null : handles[kind],
  );
  handles[kind] = handle ?? null;
}

export type ParsedFile =
  | { kind: 'demand'; data: DemandScenario }
  | { kind: 'supply'; data: SupplyScenario };

export class ScenarioFileError extends Error {}

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
  if (kind === 'demand') {
    const r = DemandFileSchema.safeParse(json);
    if (r.success) return { kind: 'demand', data: r.data.data };
    throw new ScenarioFileError(describe(r.error));
  }
  if (kind === 'supply') {
    const r = SupplyFileSchema.safeParse(json);
    if (r.success) return { kind: 'supply', data: r.data.data };
    throw new ScenarioFileError(describe(r.error));
  }
  throw new ScenarioFileError(`סוג קובץ לא מוכר: ${String(kind)}. צפוי demand או supply.`);
}

function describe(error: import('zod').ZodError): string {
  const first = error.issues[0];
  return `הקובץ לא תקין: ${first.path.join('.') || '(שורש)'}: ${first.message}`;
}

export async function readScenarioFile(file: File | FileWithHandle): Promise<ParsedFile> {
  const parsed = parseScenarioText(await file.text());
  handles[parsed.kind] = (file as FileWithHandle).handle ?? null;
  return parsed;
}

export async function openScenario(): Promise<ParsedFile> {
  const file = await fileOpen({
    extensions: ['.json'],
    mimeTypes: ['application/json'],
    description: 'קובץ תרחיש',
  });
  return readScenarioFile(file);
}

import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { he } from '../i18n/he';
import type { ScenarioKind } from '../schema';
import { useCompareStore } from '../store/compareStore';
import { useDemandStore } from '../store/demandStore';
import { useProjectsStore } from '../store/projectsStore';
import { useSupplyStore } from '../store/supplyStore';
import { useExportDialog } from './exportDialog';
import {
  clearHandle,
  isAbort,
  isEmbedded,
  openScenario,
  readScenarioFile,
  safeFileName,
  saveScenario,
  ScenarioFileError,
  serialize,
  type ParsedFile,
  type ScenarioData,
} from './scenarioFiles';

/** התרחיש או אוסף הפרויקטים הפעיל מכל סוג. */
function getData(kind: ScenarioKind): ScenarioData {
  if (kind === 'demand') return useDemandStore.getState().scenario;
  if (kind === 'supply') return useSupplyStore.getState().scenario;
  return useProjectsStore.getState().data;
}

/** טוען נתונים לחנות של הסוג שלהם. */
function setData(parsed: ParsedFile) {
  if (parsed.kind === 'demand') useDemandStore.getState().setScenario(parsed.data);
  else if (parsed.kind === 'supply') useSupplyStore.getState().setScenario(parsed.data);
  else useProjectsStore.getState().setData(parsed.data);
}

/** מחזיר את הנתונים הפעילים של סוג לערכי הדוגמה. */
function resetKind(kind: ScenarioKind) {
  if (kind === 'demand') useDemandStore.getState().reset();
  else if (kind === 'supply') useSupplyStore.getState().reset();
  else useProjectsStore.getState().reset();
}

const loadedMessage: Record<ScenarioKind, string> = {
  demand: he.files.loadedDemand,
  supply: he.files.loadedSupply,
  projects: he.files.loadedProjects,
};

/** הודעת שגיאה אדומה. */
const fail = (title: string, e: unknown) =>
  notifications.show({ color: 'red', title, message: e instanceof Error ? e.message : String(e), autoClose: 8000 });

/**
 * פעולות הקבצים של חלון הפעולות (⚙) ושל גרירת קובץ לחלון: שמירה, פתיחה, השוואה, שכפול ואיפוס.
 * בתוך iframe השמירה מציגה את ה-JSON להעתקה.
 */
export function useScenarioActions() {
  const apply = useCallback((parsed: ParsedFile) => {
    setData(parsed);
    notifications.show({ color: 'teal', message: loadedMessage[parsed.kind] });
  }, []);

  const save = useCallback(async (kind: ScenarioKind, saveAs: boolean) => {
    const data = getData(kind);
    if (isEmbedded) {
      useExportDialog.getState().showText(safeFileName(data.name, kind), serialize(kind, data));
      return;
    }
    try {
      await saveScenario(kind, data, saveAs);
      notifications.show({ color: 'teal', message: he.files.saved });
    } catch (e) {
      if (!isAbort(e)) fail(he.files.saveError, e);
    }
  }, []);

  const open = useCallback(async () => {
    try {
      apply(await openScenario());
    } catch (e) {
      if (!isAbort(e)) fail(he.files.error, e);
    }
  }, [apply]);

  const openFile = useCallback(
    async (file: File) => {
      try {
        apply(await readScenarioFile(file));
      } catch (e) {
        fail(he.files.error, e);
      }
    },
    [apply],
  );

  const loadCompare = useCallback(async () => {
    try {
      const parsed = await openScenario(false);
      if (parsed.kind === 'projects') throw new ScenarioFileError(he.compare.notProjects);
      const c = useCompareStore.getState();
      if (parsed.kind === 'demand') c.setDemand(parsed.data);
      else c.setSupply(parsed.data);
      notifications.show({
        color: 'blue',
        message:
          parsed.kind === 'demand'
            ? he.compare.loadedDemand(parsed.data.name)
            : he.compare.loadedSupply(parsed.data.name),
      });
    } catch (e) {
      if (!isAbort(e)) fail(he.files.error, e);
    }
  }, []);

  const duplicate = useCallback((kind: ScenarioKind) => {
    const d = structuredClone(getData(kind));
    const copy = { ...d, id: crypto.randomUUID(), name: d.name + he.topBar.copySuffix };
    clearHandle(kind);
    setData({ kind, data: copy } as ParsedFile);
  }, []);

  /** האישור נעשה בחלון בתוך הדף (TopBar), כי confirm() לא עובד בתוך iframe. */
  const reset = useCallback((kind: ScenarioKind) => {
    clearHandle(kind);
    resetKind(kind);
  }, []);

  return { save, open, openFile, loadCompare, duplicate, reset };
}

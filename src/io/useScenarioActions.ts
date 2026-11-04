import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { he } from '../i18n/he';
import type { DemandScenario, ProjectsData, ScenarioKind, SupplyScenario } from '../schema';
import { useCompareStore } from '../store/compareStore';
import { useDemandStore } from '../store/demandStore';
import { useProjectsStore } from '../store/projectsStore';
import { useSupplyStore } from '../store/supplyStore';
import { safeFileStem } from './download';
import { useExportDialog } from './exportDialog';
import {
  clearHandle,
  isEmbedded,
  openScenario,
  readScenarioFile,
  saveScenario,
  ScenarioFileError,
  serialize,
  type ParsedFile,
  type ScenarioData,
} from './scenarioFiles';

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** התרחיש או אוסף הפרויקטים הפעיל מכל סוג. */
function getData(kind: ScenarioKind): ScenarioData {
  if (kind === 'demand') return useDemandStore.getState().scenario;
  if (kind === 'supply') return useSupplyStore.getState().scenario;
  return useProjectsStore.getState().data;
}

function setData(parsed: ParsedFile) {
  if (parsed.kind === 'demand') useDemandStore.getState().setScenario(parsed.data);
  else if (parsed.kind === 'supply') useSupplyStore.getState().setScenario(parsed.data);
  else useProjectsStore.getState().setData(parsed.data);
}

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

const fail = (title: string, e: unknown) =>
  notifications.show({ color: 'red', title, message: e instanceof Error ? e.message : String(e), autoClose: 8000 });

/** פעולות הקבצים של הסרגל העליון ושל גרירת קובץ לחלון. */
export function useScenarioActions() {
  const apply = useCallback((parsed: ParsedFile) => {
    setData(parsed);
    notifications.show({ color: 'teal', message: loadedMessage[parsed.kind] });
  }, []);

  const save = useCallback(async (kind: ScenarioKind, saveAs: boolean) => {
    const data = getData(kind);
    if (isEmbedded) {
      useExportDialog.getState().showText(`${safeFileStem(data.name)}.${kind}.json`, serialize(kind, data));
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
    if (kind === 'demand') useDemandStore.getState().setScenario(copy as DemandScenario);
    else if (kind === 'supply') useSupplyStore.getState().setScenario(copy as SupplyScenario);
    else useProjectsStore.getState().setData(copy as ProjectsData);
  }, []);

  /** האישור נעשה בחלון בתוך הדף (TopBar), כי confirm() לא עובד בתוך iframe. */
  const reset = useCallback((kind: ScenarioKind) => {
    clearHandle(kind);
    resetKind(kind);
  }, []);

  return { save, open, openFile, loadCompare, duplicate, reset };
}

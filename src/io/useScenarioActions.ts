import { notifications } from '@mantine/notifications';
import { useCallback } from 'react';
import { he } from '../i18n/he';
import type { ScenarioKind } from '../schema';
import { useCompareStore } from '../store/compareStore';
import { useDemandStore } from '../store/demandStore';
import { useSupplyStore } from '../store/supplyStore';
import { safeFileStem } from './download';
import { useExportDialog } from './exportDialog';
import {
  clearHandle,
  isEmbedded,
  openScenario,
  readScenarioFile,
  saveScenario,
  serialize,
  type ParsedFile,
} from './scenarioFiles';

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** פעולות הקבצים של הסרגל העליון ושל גרירת קובץ לחלון. */
export function useScenarioActions() {
  const setDemand = useDemandStore((s) => s.setScenario);
  const setSupply = useSupplyStore((s) => s.setScenario);

  const apply = useCallback(
    (parsed: ParsedFile) => {
      if (parsed.kind === 'demand') setDemand(parsed.data);
      else setSupply(parsed.data);
      notifications.show({
        color: 'teal',
        message: parsed.kind === 'demand' ? he.files.loadedDemand : he.files.loadedSupply,
      });
    },
    [setDemand, setSupply],
  );

  const fail = (title: string, e: unknown) =>
    notifications.show({ color: 'red', title, message: e instanceof Error ? e.message : String(e), autoClose: 8000 });

  const save = useCallback(async (kind: ScenarioKind, saveAs: boolean) => {
    const data = kind === 'demand' ? useDemandStore.getState().scenario : useSupplyStore.getState().scenario;
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
    const store = kind === 'demand' ? useDemandStore : useSupplyStore;
    const s = store.getState().scenario;
    clearHandle(kind);
    store.getState().setScenario({ ...structuredClone(s), id: crypto.randomUUID(), name: s.name + he.topBar.copySuffix } as never);
  }, []);

  /** האישור נעשה בחלון בתוך הדף (TopBar), כי confirm() לא עובד בתוך iframe. */
  const reset = useCallback((kind: ScenarioKind) => {
    clearHandle(kind);
    (kind === 'demand' ? useDemandStore : useSupplyStore).getState().reset();
  }, []);

  return { save, open, openFile, loadCompare, duplicate, reset };
}

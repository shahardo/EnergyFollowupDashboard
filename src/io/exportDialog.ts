import { create } from 'zustand';
import type { ScenarioKind } from '../schema';

/** מצב החלון שמציג את ה-JSON של התרחיש, כשאי אפשר להוריד קובץ (בתוך iframe). */
interface ExportDialogState {
  open: boolean;
  kind: ScenarioKind;
  fileName: string;
  text: string;
  show: (kind: ScenarioKind, name: string, text: string) => void;
  close: () => void;
}

export const useExportDialog = create<ExportDialogState>()((set) => ({
  open: false,
  kind: 'demand',
  fileName: '',
  text: '',
  show: (kind, name, text) => set({ open: true, kind, fileName: `${name}.${kind}.json`, text }),
  close: () => set({ open: false }),
}));

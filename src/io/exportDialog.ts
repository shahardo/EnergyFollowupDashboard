import { create } from 'zustand';

/**
 * מצב החלון שמציג תוכן לשמירה ידנית, כשאי אפשר להוריד קובץ (בתוך iframe, למשל Artifact).
 * טקסט (JSON, CSV) מוצג להעתקה; תמונה (PNG) מוצגת לשמירה בקליק ימני.
 */
interface ExportDialogState {
  open: boolean;
  fileName: string;
  text: string | null;
  imageUrl: string | null;
  showText: (fileName: string, text: string) => void;
  showImage: (fileName: string, imageUrl: string) => void;
  close: () => void;
}

export const useExportDialog = create<ExportDialogState>()((set) => ({
  open: false,
  fileName: '',
  text: null,
  imageUrl: null,
  showText: (fileName, text) => set({ open: true, fileName, text, imageUrl: null }),
  showImage: (fileName, imageUrl) => set({ open: true, fileName, text: null, imageUrl }),
  close: () => set({ open: false }),
}));

import { fileSave } from 'browser-fs-access';
import { useExportDialog } from './exportDialog';
import { isAbort, isEmbedded } from './scenarioFiles';

/** מוריד טקסט כקובץ. בתוך iframe מציג אותו להעתקה. מחזיר false אם המשתמש ביטל. */
export async function downloadText(fileName: string, text: string, mimeType: string): Promise<boolean> {
  if (isEmbedded) {
    useExportDialog.getState().showText(fileName, text.replace(/^\uFEFF/, ''));
    return true;
  }
  return save(new Blob([text], { type: mimeType }), fileName);
}

/** מוריד תמונה (data URL) כקובץ. בתוך iframe מציג אותה לשמירה ידנית. */
export async function downloadImage(fileName: string, dataUrl: string): Promise<boolean> {
  if (isEmbedded) {
    useExportDialog.getState().showImage(fileName, dataUrl);
    return true;
  }
  return save(await (await fetch(dataUrl)).blob(), fileName);
}

/** שומר blob דרך בוחר הקבצים (או הורדה רגילה). מחזיר false אם המשתמש ביטל. */
async function save(blob: Blob, fileName: string): Promise<boolean> {
  const dot = fileName.lastIndexOf('.');
  try {
    await fileSave(blob, { fileName, extensions: dot > 0 ? [fileName.slice(dot)] : [] });
    return true;
  } catch (e) {
    if (isAbort(e)) return false;
    throw e;
  }
}

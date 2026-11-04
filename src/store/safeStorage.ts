import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** localStorage שלא זורק שגיאה: אם הגישה נכשלת (מצב פרטי, אחסון חסום), האפליקציה ממשיכה לעבוד בלי שמירה. */
const safe: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* מתעלמים */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* מתעלמים */
    }
  },
};

export const safeJSONStorage = createJSONStorage(() => safe);

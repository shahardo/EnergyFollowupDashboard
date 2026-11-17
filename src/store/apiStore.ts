import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, setApiToken, type Health } from '../api/client';
import { safeJSONStorage } from './safeStorage';

interface ApiState {
  /** unknown עד הבדיקה הראשונה; online רק כשהשרת שלנו ענה. */
  status: 'unknown' | 'online' | 'offline';
  health: Health | null;
  /** טוקן ההרצה (נשמר בדפדפן הזה בלבד). */
  token: string;
  setToken: (t: string) => void;
  /** בודק את השרת (פעם אחת בטעינה; אפשר שוב). */
  check: () => Promise<void>;
}

/** מצב השרת האופציונלי, והטוקן לכתיבה. */
export const useApiStore = create<ApiState>()(
  persist(
    (set) => ({
      status: 'unknown',
      health: null,
      token: '',
      setToken: (token) => {
        setApiToken(token || null);
        set({ token });
      },
      check: async () => {
        const health = await api.health();
        set({ health, status: health ? 'online' : 'offline' });
      },
    }),
    {
      name: 'energy-dashboard/api',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({ token: st.token }),
      merge: (persisted, current) => {
        const t = (persisted as { token?: unknown } | undefined)?.token;
        const token = typeof t === 'string' ? t : '';
        setApiToken(token || null);
        return { ...current, token };
      },
    },
  ),
);

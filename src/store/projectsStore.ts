import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { baselineProjects } from '../data/baseline';
import { migrateProjectsV1 } from '../io/migrateV1';
import { ProjectsDataSchema, type Project, type ProjectsData } from '../schema';
import { ProjectsDataSchemaV1 } from '../schema/v1';
import { safeJSONStorage } from './safeStorage';

/** רשימת המשימות של גאנט המעקב, והפעולות עליה. */
interface ProjectsState {
  data: ProjectsData;
  /** מוסיף פרויקט חדש, או מחליף את הפרויקט עם אותו id. */
  upsertProject: (p: Project) => void;
  deleteProject: (id: string) => void;
  setAsOf: (asOf: string) => void;
  setData: (d: ProjectsData) => void;
  rename: (name: string) => void;
  reset: () => void;
}

/** חנות המשימות (נשמרת ב-localStorage, גרסה 3). */
export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      data: structuredClone(baselineProjects),
      upsertProject: (p) =>
        set((st) => {
          const exists = st.data.projects.some((x) => x.id === p.id);
          const projects = exists ? st.data.projects.map((x) => (x.id === p.id ? p : x)) : [...st.data.projects, p];
          return { data: { ...st.data, projects } };
        }),
      deleteProject: (id) =>
        set((st) => ({ data: { ...st.data, projects: st.data.projects.filter((x) => x.id !== id) } })),
      setAsOf: (asOf) => set((st) => ({ data: { ...st.data, asOf } })),
      setData: (data) => set({ data }),
      rename: (name) => set((st) => ({ data: { ...st.data, name } })),
      reset: () => set({ data: structuredClone(baselineProjects) }),
    }),
    {
      name: 'energy-dashboard/projects',
      storage: safeJSONStorage,
      // גרסה 3: משימות אסטרטגיות לדוגמה עד 2050; מצב ישן יותר חוזר לרשימה החדשה.
      // גרסה 4: מקורות חדשים; רשימה מגרסה 3 נשמרת, ומקבלת את משימות הדוגמה של מקורות שאין להם אף משימה.
      // גרסה 5: יחידות SI (התקדמות כשבר, הספק ב-W); רשימה מגרסה 3–4 מומרת.
      version: 5,
      migrate: (persisted, version) => {
        if (version >= 5) return persisted;
        const old = ProjectsDataSchemaV1.safeParse((persisted as Partial<ProjectsState>)?.data);
        if (version < 3 || !old.success) return { data: structuredClone(baselineProjects) };
        const data = migrateProjectsV1(old.data);
        if (version >= 4) return { data };
        const have = new Set(data.projects.map((p) => p.channel));
        const ids = new Set(data.projects.map((p) => p.id));
        const added = baselineProjects.projects.filter((p) => !have.has(p.channel) && !ids.has(p.id));
        return { data: { ...data, projects: [...data.projects, ...structuredClone(added)] } };
      },
      partialize: (st) => ({ data: st.data }),
      merge: (persisted, current) => {
        const parsed = ProjectsDataSchema.safeParse((persisted as Partial<ProjectsState>)?.data);
        return parsed.success ? { ...current, data: parsed.data } : current;
      },
    },
  ),
);

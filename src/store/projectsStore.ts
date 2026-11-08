import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { baselineProjects } from '../data/baseline';
import { ProjectsDataSchema, type Project, type ProjectsData } from '../schema';
import { safeJSONStorage } from './safeStorage';

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

const clone = <T,>(v: T): T => structuredClone(v);

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set) => ({
      data: clone(baselineProjects),
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
      reset: () => set({ data: clone(baselineProjects) }),
    }),
    {
      name: 'energy-dashboard/projects',
      storage: safeJSONStorage,
      version: 1,
      partialize: (st) => ({ data: st.data }),
      merge: (persisted, current) => {
        const parsed = ProjectsDataSchema.safeParse((persisted as Partial<ProjectsState>)?.data);
        return parsed.success ? { ...current, data: parsed.data } : current;
      },
    },
  ),
);

# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

> **Keep this file current.** Update it in the same commit as any significant change:
> a new feature or screen, a change to the data schema or file format, a new dependency,
> a change to the folder structure, the commands, or the conventions below.
> Update the **Status** section whenever a roadmap phase item lands.

## What this is

A static, browser-only (no server) Hebrew/RTL dashboard for planning Israel's energy system:
demand by sector → supply by source → execution tracking. The full design is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (in Hebrew); this file covers how the code
is actually organised.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies (Node 22) |
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck (`tsc -b`) and production build to `dist/` |
| `npm run preview` | Serve `dist/` locally |

CI (`.github/workflows/ci.yml`) runs lint, test, and build on every push and PR, and deploys
`dist/` to GitHub Pages on push to `main`.

## Stack

React 18 + TypeScript + Vite · Mantine 7 (UI, RTL via `DirectionProvider`) · ECharts 5
(`echarts-for-react`, tree-shaken through `echarts/core`) · Zustand 5 with `persist` · Zod 3 ·
`browser-fs-access` · React Router 6 (`HashRouter`) · Vitest.

## Layout

```
src/
  schema/index.ts        Zod schemas = the single source of the data types (z.infer)
  data/                  Baseline scenarios (sample values) as ScenarioFile JSON + baseline.ts
  model/                 Pure calculation engine — NO React, NO stores
    years.ts             yearRange, HOURS_PER_YEAR_K (8.76)
    demand.ts            sectorTWh, projectDemand, demandTotals, peakFromEnergy
    supply.ts            interpolateCapacity, sourceCapacity, computeSupply
    gap.ts               computeGap
  store/                 Zustand stores (demand, supply, ui) + useSeries (memoised derived data)
  io/                    scenarioFiles.ts (save/open/validate), useScenarioActions.ts (UI wiring)
  components/
    charts/              StackedAreaChart, palette (fixed colour per sector/source)
    controls/            SectorSlider, SourceToggle
    layout/              TopBar, KpiCard
  pages/                 DemandPage, SupplyPage, TrackingPage (placeholder)
  i18n/he.ts             Every user-visible string
```

## Data flow

`DemandScenario` → `projectDemand` → `demandTotals` ─┐
`SupplyScenario` → `computeSupply` ──────────────────┴→ `computeGap` → charts + KPI cards.
`useSeries()` in `src/store/useSeries.ts` runs this chain and memoises it on the two scenarios.

Key formulas: `peakGW = TWh / (8.76 × loadFactor)`; `TWh = GW × CF × 8.76`;
`firmGW = GW × capacityCredit`. Total peak demand is the **sum** of sector peaks (conservative:
it assumes the sector peaks coincide). The S-curve reaches the same horizon value as `exp`,
with its inflection at `sMidYear`.

## Conventions

- **Calculations live in `src/model/` as pure functions** with tests next to them. Anything that
  touches React or a store goes in `src/store/` or a component, never in `model/`.
- **Types come from Zod.** Add or change a field in `src/schema/index.ts`; don't hand-write a
  parallel interface. If the saved-file shape changes incompatibly, bump `SCHEMA_VERSION` and add
  a migration in `src/io/scenarioFiles.ts`.
- **All UI strings go in `src/i18n/he.ts`.** The UI is Hebrew and RTL (`<html dir="rtl">` +
  Mantine `DirectionProvider`). Numbers and units that must read LTR get `direction: 'ltr'`.
- Mantine `Slider` accessible names go through `thumbLabel`, not `aria-label`.
- `localStorage` access goes through `src/store/safeStorage.ts`, so a failure never breaks the app.
  Persisted state is re-validated with Zod on load; invalid state falls back to the baseline.
- File handles (Chrome/Edge "Save" to the same file) are kept in memory in `scenarioFiles.ts`,
  never persisted.
- Sector and source colours are fixed in `components/charts/palette.ts`; add new keys there.
- Baseline data is **sample data**: the UI labels it as such. It lives in `src/data/` (bundled
  and validated at import) rather than `public/data/` as the design doc first proposed.

## Saved files

Envelope: `{ schema: 'energy-dashboard/v1', kind: 'demand' | 'supply', savedAt, data }`.
Extensions: `*.demand.json`, `*.supply.json`. Opening a file (button or drag-and-drop anywhere
in the window) detects its `kind` and loads it into the matching store.

Deviation from the design doc: `SupplySource` has a `renewable: boolean` field, which
`computeGap` uses for the renewable share.

## Status

**Phase 1 (MVP): done.** Demand screen (stacked areas, per-sector growth sliders, advanced panel,
TWh/GW), supply screen (per-source toggle, GW anchor points, CF, capacity credit, retire year,
red gap area, energy and peak coverage, renewable share), target year, save / save-as / open /
duplicate / reset, drag-and-drop open, localStorage autosave, mismatch warning between supply
and demand scenarios.

**Not yet built:**
- Phase 2: `autoFill` + priority drag list, scenario comparison overlay, CSV/PNG export.
- Phase 3: projects / Gantt tracking screen (`TrackingPage` is a placeholder), `projects.json`.
- Phase 4: hourly profile, sensitivity analysis.
- Playwright e2e tests (the save → open → same results flow was verified manually).

Known quirk: in this container's headless Chromium, a Hebrew download filename falls back to
`download`. English names keep their name; not yet checked in a regular browser.

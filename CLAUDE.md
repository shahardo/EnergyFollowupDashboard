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
| `npm run fit:supply` | Regenerate the 9 supply presets from `src/data/policies/` (run after editing a policy or a demand preset) |

CI (`.github/workflows/ci.yml`) runs lint, test, and build on every push and PR, and deploys
`dist/` to GitHub Pages on push to the repo's **default branch**. `main` is the primary branch
and should be set as the default in the repo settings.

## Stack

React 18 + TypeScript + Vite · Mantine 7 (UI, RTL via `DirectionProvider`) · ECharts 5
(`echarts-for-react`, tree-shaken through `echarts/core`) · Zustand 5 with `persist` · Zod 3 ·
`browser-fs-access` · React Router 6 (`HashRouter`) · Vitest.

## Layout

```
src/
  schema/index.ts        Zod schemas = the single source of the data types (z.infer)
  data/                  scenarios/*.json: preset scenarios (sample values) as ScenarioFile JSON: demand-low/medium/high
                         and 9 GENERATED supply-<demand>-<policy>.json; policies/supply-<policy>.json: the 3 policy
                         templates they are fitted from; baseline.ts (demandPresets, supplyPresets[demand][policy],
                         baselineDemand = medium, baselineSupply = medium/declared, baselineProjects);
                         upgradeSupply.ts / upgradeDemand.ts (bring older saved scenarios up to a preset's lists)
  model/                 Pure calculation engine — NO React, NO stores
    years.ts             yearRange, HOURS_PER_YEAR_K (8.76)
    demand.ts            sectorTWh, projectDemand, demandTotals, peakFromEnergy
    supply.ts            interpolateCapacity, sourceCapacity, computeSupply, setCapacityAt
    measures.ts          rampShare, applyMeasures, netTotals (energy efficiency + energy saving)
    sliderRange.ts       centeredRange (slider range with the base value exactly in the middle)
    gap.ts               computeGap
    autofill.ts          autoFill, autoFillYears (greedy gap filling by fillPriority), autoAdjust (fill + proportional scale-down)
    projects.ts          expectedProgress, projectStatus, projectedEnd, projectsToCapacity, channelTargets
  store/                 Zustand stores (demand, supply, projects, ui, compare) + useSeries (memoised derived data)
  io/                    scenarioFiles.ts (save/open/validate), useScenarioActions.ts (UI wiring),
                         csvExport.ts (pure CSV builders), download.ts (file or dialog),
                         exportDialog.ts (state of the "copy text / save image" dialog used when embedded)
  components/
    charts/              StackedAreaChart, GanttChart (both: ref → toPng), ChartCard (title, CSV/PNG,
                         compare chip; the chart goes in as children), palette
    charts/patterns.ts   striped canvas fill (reduction band, Gantt progress)
    charts/legend.ts     splitLegend, legendTextCap (two-row legend under the chart, no scrolling)
    controls/            CenteredSlider (+ .module.css), Slider.module.css (global slider style),
                         SectorDetails, SourceDetails (gear content), AutoFillPanel, ProjectEditor
    plan/                DemandColumn, SupplyColumn (chart + parameter panel each), MeasuresPanel
                         (efficiency/saving sliders: demand-scenario values, shown on the supply side)
    layout/              TopBar (+ .module.css: one row = title, tabs, controls at the far left; on phones the tabs
                         drop to their own row; the active tab is tinted --page-tint and merges into the page),
                         ActionsModal (⚙: save/open/compare/duplicate/reset cards), icons (inline SVG),
                         KpiCard, ChannelCard, ExportDialog
  pages/                 PlanPage (demand + supply side by side; /demand and /supply redirect here), TrackingPage
  i18n/he.ts             Every user-visible string
```

## Data flow

`DemandScenario` → `projectDemand` → `demandTotals` ─┐
`SupplyScenario` → `computeSupply` ──────────────────┴→ `computeGap` → charts + KPI cards.
`useSeries()` in `src/store/useSeries.ts` runs this chain and memoises it on the two scenarios.
Between demand and supply sit the **demand reductions** (`model/measures.ts`): energy efficiency and
energy saving, each a % reached at the horizon and ramped linearly from the base year; both cut
energy and peak, combined multiplicatively `(1 − e)(1 − s)`. `useSeries().totals` is **net** demand
(used by the gap, auto-fill and KPIs); `grossTotals` / `measured` hold the gross and the breakdown.
The demand chart stacks gross sector demand only. The supply chart draws the reductions as a striped band
above the dashed net-demand line (net → gross, its own ECharts stack) and leaves the gap unfilled (white).

Key formulas: `peakGW = TWh / (8.76 × loadFactor)`; `TWh = GW × CF × 8.76`;
`firmGW = GW × capacityCredit`. Total peak demand is the **sum** of sector peaks (conservative:
it assumes the sector peaks coincide). The S-curve reaches the same horizon value as `exp`,
with its inflection at `sMidYear`.

**Auto-fill** (`model/autofill.ts`): at anchor years every 5 years (plus the horizon), first close
the energy gap walking `fillPriority` (sources with CF > 0), then the peak gap: firm sources
(`capacityCredit ≥ FIRM_CREDIT_MIN = 0.5`) first, low-credit ones only after. Each source is capped
by its optional `maxGW` (also when its base capacity rises after an earlier addition: the carried addition shrinks). Built capacity never shrinks between anchors; values round **up** to 0.01 GW
so no gap is left. A disabled source that receives capacity is enabled with only the added capacity.
The supply store keeps one `previous` snapshot (not persisted) for undo. The UI has no reordering: sources are
ticked in a two-column checkbox list, and a newly ticked source joins the end of `fillPriority`. The panel always
starts collapsed (`autofillOpen` is not persisted); while collapsed its header shows a ▶ button (triangle
pointing left, right after the title, on its left) that runs auto-adjust without opening it. Notifications skip changes under 0.05 GW.
The UI runs **auto-adjust** ("התאמה אוטומטית", `autoAdjust`): `autoFill` first, then at every anchor year
where supply energy exceeds demand, all enabled sources are scaled by one factor
`k = max(demandTWh / supplyTWh, peakGW / firmGW)` (≤ 1; ignored above 0.999), so energy matches demand
without dropping below 100% peak coverage. k is interpolated between anchors; values round up to 0.01 GW.

**Comparison** (`store/compareStore.ts`): a demand and/or supply scenario loaded from a file
("טען תרחיש להשוואה" in the menu) and drawn as a dashed blue total line. It never affects the
main calculation. Loading it doesn't touch the active scenario's save handle.

**Scenario presets** (`data/baseline.ts`, `demandStore`, `supplyStore`): demand has three presets
(`low` / `medium` / `high`); for **each** of them there are three supply policies (`reference` = business as usual /
`declared` = stated policy / `tested` = net-zero), each fitted so that its demand is fully met (energy and peak) in
every year: 9 supply presets. A `Select` above each parameter panel picks the demand preset / the policy (it replaced
the name box). The supply store follows the demand store's `active` (subscription → `setDemandPreset`), so switching
demand keeps the policy and shows its version for the new demand.
Demand store: `active`, `scenarios: Record<DemandPreset, …>`; supply store: `demandPreset`, `active`,
`scenarios: Record<DemandPreset, Record<SupplyPreset, …>>`. Every slot keeps its own edits (persisted), and `scenario`
is the active slot, kept in sync by `patchActive`, so `s.scenario` selectors work as before. `reset()` restores only
the active slot; `setScenario` (open / duplicate) writes to the slot named by the file's optional `preset`
(and `demandPreset` for supply, which also switches the demand), else to the active one. Persist versions: demand 2,
supply 3 (older supply state goes into the medium-demand row). Slider centres come from the active preset. Presets
carry no `demandScenarioRef`, so the mismatch warning doesn't fire.
**Supply presets are generated**: `scripts/fit-supply-presets.ts` (`npm run fit:supply`) runs `autoAdjust` on each
policy template against each demand's net totals, then tops up any year still short (energy by `fillPriority`, peak by
firm sources, respecting `maxGW`). `src/data/presets.test.ts` checks every preset covers its demand every year and
stays under `maxGW`. Don't hand-edit `scenarios/supply-*.json`; edit `policies/` and re-run.

**Legends** (`StackedAreaChart`): two plain ECharts legends under the plot (first `ceil(n/2)` names, then the rest).
The chart width is tracked with a ResizeObserver; text is measured in the legend's font and labels that would make a
row wrap are truncated to a common cap (`legendTextCap`), with the full name in the legend tooltip.

**Export**: CSV (UTF-8 with BOM, for Excel) and PNG (2×, opaque background) from each chart card.

**Tracking** (`model/projects.ts`, `pages/TrackingPage.tsx`): one collection-level `asOf` date drives
both the "today" line and the status. Status = explicit `status` if set; else progress vs. expected
(linear in time): within 10 points on-track, within 25 at-risk, else delayed (`ON_TRACK_TOLERANCE`,
`AT_RISK_TOLERANCE`). `projectedEnd` extrapolates the current pace when behind (never before the
planned end; `null` with 0% progress more than 30 days after start). Channel cards compare
`projectsToCapacity` (MW of projects projected to finish by the target year) with `channelTargets`
(supply-scenario capacity at the target year minus at the base year, via `sourceCapacity`, so a retired source has no target). The Gantt is an ECharts
`custom` series: outlined planned bar, striped progress segment in the status colour, dashed
extension to the projected end, and the `asOf` line.

## Conventions

- **Calculations live in `src/model/` as pure functions** with tests next to them. Anything that
  touches React or a store goes in `src/store/` or a component, never in `model/`.
- **Types come from Zod.** Add or change a field in `src/schema/index.ts`; don't hand-write a
  parallel interface. If the saved-file shape changes incompatibly, bump `SCHEMA_VERSION` and add
  a migration in `src/io/scenarioFiles.ts`.
- **All UI strings go in `src/i18n/he.ts`.** The UI is Hebrew and RTL (`<html dir="rtl">` +
  Mantine `DirectionProvider`). Numbers and units that must read LTR get `direction: 'ltr'`.
- Mantine `Slider` accessible names go through `thumbLabel`, not `aria-label`.
- **Sliders:** one style for all, in `Slider.module.css`, applied through the theme in `main.tsx`;
  don't style sliders locally. Parameter sliders use `CenteredSlider`: the range comes from
  `centeredRange` so the **active preset's value (from `src/data/scenarios/*.json`) is in the middle**, and the
  result (TWh in the horizon year) shows at the side. Sector rows control growth %, source rows the
  installed GW in the horizon year (`setCapacityAt`). Reduction sliders (`centered={false}`) start at 0.
  Detailed parameters (anchor years, CF, credit, curve, LF…) are hidden behind the ⚙ gear.
- In RTL, the left arrow key increases a slider value (min is on the right).
- Zustand selectors must return stable values (state fields or store actions). A selector that
  builds a new function or object each call causes an infinite render loop (React error #185).
- `localStorage` access goes through `src/store/safeStorage.ts`, so a failure never breaks the app.
  Persisted state is re-validated with Zod on load; invalid state falls back to the baseline.
- File handles (Chrome/Edge "Save" to the same file) are kept in memory in `scenarioFiles.ts`,
  never persisted.
- **The app must also work embedded in a sandboxed iframe** (the claude.ai Artifact). There,
  downloads, `showSaveFilePicker`/`showOpenFilePicker` and `window.confirm()` don't work. So:
  `isEmbedded` in `scenarioFiles.ts` switches Save and CSV export to a dialog that shows the text
  for copying, PNG export to a dialog showing the image, and Open to a plain `<input type="file">`; confirmations are Mantine modals, never `confirm()`.
  `main.tsx` sets `dir`/`lang` on `<html>` from code and honours a host `data-theme` attribute.
- **KPI cards** (`KpiCard`, `PlanPage`): each card shows the target year and the horizon year side by side
  (2035 and 2050 by default; one column if they coincide). `fmtPct` keeps one decimal when a value below 100%
  would round to 100%. Number + unit inside Hebrew hint text is wrapped in LTR isolates (U+2066…U+2069).
- **Detail level** (`uiStore.detail`, persisted; control titled "פירוט" next to TWh/GW, plan tab only, showing
  three dots — large / medium / small — with hidden text names and tooltips): `high` shows
  everything; `medium` hides the side values (TWh/GW, vs-base note) and the panel hints, leaving clean sliders
  on the same line as their label (stacked only in very narrow cells);
  `low` removes the sliders and gears, leaving legend rows (supply rows keep their enable checkbox).
  `CenteredSlider` reads it from the store itself.
- `CenteredSlider` rows respond to their cell width (CSS container query), not the screen: below 28rem the
  name goes above the axis. The parameter panels lay the rows out in two columns (`SimpleGrid`).
- Save / open / duplicate / compare / reset, and the **target year** selector, live in a modal opened by the ⚙
  button at the far left of the top bar (both tabs); the action runs in the same click so file pickers still work.
- **Demand sectors** (every preset): residential, commercial, industry, transport, AI/data centres, water,
  agriculture, Palestinian Authority (`pa`). Measures: low 10%/10%, medium 7%/7%, high 3%/3% (efficiency/saving). `upgradeDemand` runs on
  persisted state and `setScenario`: adds missing baseline sectors (baseline order) and gives a scenario without
  a `measures` field the baseline's (explicit values are kept).
- **Supply sources** (every preset): gas, LNG import, coal, solar, wind, deep geothermal, storage, nuclear, fusion,
  electricity import, fossil-fuel import, clean-fuel import, hydrogen import, other. The newer ones start disabled (except in `tested`, which enables geothermal and the clean imports).
  `upgradeSupply` runs on persisted state and on `setScenario` (open/duplicate): it renames the legacy `import`
  source to `importElectricity` (keeping its values) and adds missing baseline sources, in baseline order.
- Sector and source colours are fixed in `components/charts/palette.ts`; add new keys there.
- Baseline data is **sample data**: the UI labels it as such. It lives in `src/data/` (bundled
  and validated at import) rather than `public/data/` as the design doc first proposed.

## Where to view it

- **GitHub Pages** (once Pages is enabled with Source = GitHub Actions; deploys from the default branch):
  https://shahardo.github.io/EnergyFollowupDashboard/
- **claude.ai Artifact** (private): built from `dist/`. The page is a copy of `dist/index.html`
  without the document skeleton, with `dist/assets/*` published alongside. Republish after each
  significant change.

## Saved files

Envelope: `{ schema: 'energy-dashboard/v1', kind: 'demand' | 'supply' | 'projects', savedAt, data }`.
`data.preset` (optional) says which preset slot a demand / supply file belongs to; supply files may also carry
`demandPreset` (the demand preset they were fitted to).
Extensions: `*.demand.json`, `*.supply.json`, `*.projects.json`. Opening a file (button or drag-and-drop anywhere
in the window) detects its `kind` and loads it into the matching store.

`DemandScenario.measures` (`{ efficiencyPct, savingPct }`, 0..40) is optional, so older files load.

Deviations from the design doc: `SupplySource` has a `renewable: boolean` field, which
`computeGap` uses for the renewable share, and an optional `maxGW` (auto-fill cap). Both stay
within `energy-dashboard/v1`; `maxGW` is optional, so older files still load. Projects files hold
`{ id, name, asOf, projects }`: one `asOf` for the whole list instead of one per project.

## Status

**Phase 1 (MVP): done.** Demand screen (stacked areas, per-sector growth sliders, advanced panel,
TWh/GW), supply screen (per-source toggle, GW anchor points, CF, capacity credit, retire year,
red gap area, energy and peak coverage, renewable share), target year, save / save-as / open /
duplicate / reset, drag-and-drop open, localStorage autosave, mismatch warning between supply
and demand scenarios.

**Phase 2 (advanced supply): done.** Auto-fill with a priority list (include/exclude per
source, per-source `maxGW` cap, undo), scenario comparison overlay on both charts, CSV and PNG
export of each chart.

**Phase 3 (tracking): done.** Gantt grouped by channel with status colours, "as of" date, filters by
channel / status / owner, project editor (add, edit, delete, milestones, status override), channel
cards vs. supply targets, save/open `*.projects.json`, CSV/PNG of the Gantt. Sample projects are
fictional and labelled as such.

**Combined planning page: done.** Demand and supply side by side, each with its panel below;
centred "axis" sliders with the 2050 value at the side; energy efficiency and energy saving as a
striped band at the top of the demand curve; supply gap left white; source details behind a gear;
auto-fill moved to the bottom and collapsed by default (state in `uiStore.autofillOpen`).
Parameters in two columns under each chart; file actions in a ⚙ modal (cards per action, demand | supply
buttons); auto-fill renamed to auto-adjust and now also scales supply down proportionally when it exceeds
demand, with a two-column include list instead of drag-and-drop; efficiency and saving moved to the supply
panel; supply sources extended (LNG, nuclear, fusion, deep geothermal, hydrogen import; import split three ways).
Three-level detail control (full / sliders only / legend only), shown as three dots. The efficiency/saving
band moved from the demand chart to the supply chart. Medium detail keeps sliders inline; efficiency and saving
start at 7%; ▶ on the collapsed auto-adjust panel; target year moved into the ⚙ modal; Palestinian Authority
demand sector. KPI cards show both the target year and 2050; ▶ sits just left of the auto-adjust title.
Two real tabs (outline style) under the title row; legends below the charts in two rows; three demand presets
(low/medium/high) and three supply presets (reference/declared/tested) in dropdowns, each keeping its own edits;
units button reads "TWh/y". Tabs moved into the title row (controls at the far left, active tab gray and merged into
the gray page); 9 supply presets, three per demand preset, each meeting its demand.

**Not yet built:**
- Phase 4: hourly profile, sensitivity analysis.
- Playwright e2e tests (the save → open → same results flow was verified manually).

Known quirk: in this container's headless Chromium, a Hebrew download filename falls back to
`download`. English names keep their name; not yet checked in a regular browser.

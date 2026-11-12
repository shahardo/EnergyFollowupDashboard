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
                         and 9 GENERATED supply-<demand>-<policy>.json; trilemma.ts (sample trilemma scores + feasibility per
                         source key, scoreFor falls back to `other`; defaultMaxGW, weightPresets, defaultWeights, defaultStartYears for the priority tab); policies/supply-<policy>.json: the 3 policy
                         templates they are fitted from; baseline.ts (demandPresets, supplyPresets[demand][policy],
                         baselineDemand = medium, baselineSupply = medium/declared, baselineProjects);
                         upgradeSupply.ts / upgradeDemand.ts (bring older saved scenarios up to a preset's lists; both use
                         mergeByBaseline.ts: add missing items, stable sort into baseline order)
  model/                 Pure calculation engine — NO React, NO stores
    years.ts             yearRange, HOURS_PER_YEAR_K (8.76)
    math.ts              clamp, linearShare (0..1 ramp), roundUp2 (ceil to 0.01 GW), round2
    series.ts            computeDemandSeries (sectors → gross → measures → net) and computeSeries (+ supply, gap):
                         the whole chain, used by useSeries and the fit script
    demand.ts            sectorTWh, projectDemand, demandTotals, peakFromEnergy
    supply.ts            interpolateCapacity, energyTWh (GW × CF × 8.76), sourceCapacity, computeSupply, setCapacityAt, scaleCapacityFrom (slider: scales
                         every anchor from SCALE_FROM_YEAR = 2030 to the horizon by new/old horizon value)
    measures.ts          rampShare, applyMeasures, netTotals (energy efficiency + energy saving)
    sliderRange.ts       centeredRange (slider range with the base value exactly in the middle)
    gap.ts               computeGap
    fuel.ts              sourceMtoe, sourceBcm, sourceMtCo2, fuelRatios (primary energy in Mtoe/שעט"ן, gas in BCM, emissions in Mt CO₂eq)
    autofill.ts          fillGreedy (the one greedy step: energy by fillPriority, then peak firm-first), autoFill,
                         autoFillYears, autoAdjust (fill + proportional scale-down), topUpEveryYear (fills gaps left between anchors);
                         autoFill / topUpEveryYear take optional { startYear } (no new build in a source before it)
    priority.ts          normalizeWeights, meritScore, rankSources, existingFleet, effectiveStartYear / startYearsFor,
                         idealSupply (the priority tab's ideal curve),
                         mixMetrics (energy-weighted mix scores + emissions per year)
    trilemma.ts          TrilemmaScore, axisPoint, trianglePoints, trilemmaHue, feasibilityColor
    pyramid.ts           groundPoint, project (orthographic: yaw about a pivot + pitch above the horizon; DEFAULT_VIEW = YAW 20°,
                         PITCH atan ½), viewDir, normalizeYaw, clampPitch (0..80°), buildPyramid (faces, culling, yaw-relative light)
    projects.ts          PROJECT_STATUSES, parseDate/formatDate, expectedProgress, projectStatus, projectedEnd, assignLanes, channelProgress, tasksDueBy, channelTargets
  store/                 Zustand stores (demand, supply, projects, ui, compare, priority: weights, options, edited trilemma
                         scores and caps; useScoreOf) + useSeries (derived data, memoised at module
                         level on the two scenario objects, so every caller shares one computation)
  utils/format.ts        fmt, fmtPct, ltr (LTR isolate), escapeHtml (for ECharts tooltip HTML)
  io/                    scenarioFiles.ts (save/open/validate, isAbort, safeFileStem/safeFileName), useScenarioActions.ts (UI wiring),
                         csvExport.ts (pure CSV builders), download.ts (file or dialog),
                         exportDialog.ts (state of the "copy text / save image" dialog used when embedded)
  components/
    charts/              StackedAreaChart, GanttChart (energy-sources Gantt with a KPI box per source; both: ref → toPng), ChartCard (title, `controls`
                         slot, CSV/PNG, compare chip; the chart goes in as children), palette, echartsCore.ts (ChartHandle,
                         themeColors, BASE_OPTION, textWidth with the page font read once, useChartPng)
    charts/patterns.ts   striped canvas fill (reduction band, Gantt progress)
    charts/legend.ts     splitLegend, legendTextCap (two-row legend under the chart, no scrolling)
    charts/hover.ts      stackBands, pickHovered (which band / line is under the pointer: bolds its tooltip row)
    controls/            CenteredSlider (+ .module.css, useSingleGear: one open gear per list), inputs.tsx (numOr, ColorSquare),
                         Slider.module.css (global slider style),
                         SectorDetails, SourceDetails (gear content), AutoFillPanel, ProjectEditor
    plan/                DemandColumn, SupplyColumn (chart + parameter panel each; the preset Select, ScenarioSelect.tsx, sits in the
                         chart card's title row, between the title and CSV/PNG, with a ScenarioSwatch instead of the chevron),
                         unitSeries.ts (unitInfo, ratioOf, useUnitFactor, modeNote), MeasuresPanel
                         (efficiency/saving sliders: demand-scenario values, in the demand panel under the sectors)
    trilemma/            TrilemmaCard (inline SVG: 3 axes, 25/50/75/100% grid, score triangle, "יישימות:" + bar),
                         PyramidCard (3D pyramid: the score triangle as base, height = feasibility, ticked height axis),
                         parts.tsx (shared: GRID, pts, strokes, CardHeader, AxisLabel, FeasibilityLine), trilemma.module.css
    layout/              TopBar (+ .module.css: one row = title, tabs, controls at the far left; on phones the tabs
                         drop to their own row; the active tab is tinted --page-tint and merges into the page),
                         UnitsControl (+ .module.css: units grouped אנרגיה | חשמל | גז | פליטות), ActionsModal (⚙: save/open/compare/duplicate/reset cards), icons (inline SVG),
                         KpiCard, ExportDialog, ConfirmBody (the confirm dialog body for reset / delete)
  components/priority/   PriorityControls (WeightsPanel, OptionsPanel), RankingTable (editable scores / feasibility / caps)
  pages/                 PlanPage (demand + supply side by side; /demand and /supply redirect here), PriorityPage (/priority), TrackingPage,
                         TrilemmaPage (/trilemma; with `pyramid` prop also /pyramid)
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
The demand chart stacks gross sector demand and draws the reductions as a striped band at the top of the stack
(net → gross, its own ECharts stack; under the stripes a light tint of each layer's colour, so the sectors show
through; efficiency dark blue `#1864ab`, saving amber `#e67700`, 2px dashed separators) with a dashed
net-demand line. A checkbox in the measures panel (`uiStore.reductionBold`, persisted, default on) switches the stripes
to very light and faint (`reduction.faint`; the net line stays strong). The supply chart draws only a solid
net-demand line and leaves the gap unfilled (white).

Key formulas: `peakGW = TWh / (8.76 × loadFactor)`; `TWh = GW × CF × 8.76`;
`firmGW = GW × capacityCredit`. Total peak demand is the **sum** of sector peaks (conservative:
it assumes the sector peaks coincide). The S-curve reaches the same horizon value as `exp`,
with its inflection at `sMidYear`.

**Auto-fill** (`model/autofill.ts`): at anchor years every 5 years (plus the horizon), first close
the energy gap walking `fillPriority` (sources with CF > 0), then the peak gap: firm sources
(`capacityCredit ≥ FIRM_CREDIT_MIN = 0.5`) first, low-credit ones only after. Each source is capped
by its optional `maxGW` (also when its base capacity rises after an earlier addition: the carried addition shrinks). Built capacity never shrinks between anchors; values round **up** to 0.01 GW
so no gap is left. A disabled source that receives capacity is enabled with only the added capacity.
The supply store keeps one `previous` snapshot (not persisted) for undo; any other edit of the active scenario clears it,
so Undo never discards edits made after the adjustment. The UI has no reordering: sources are
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
every year: 9 supply presets. A `Select` in each chart card's title row (its chevron replaced by a small recessed glossy
"LED" rectangle, `ScenarioSwatch`; in the open list it sits at the left of each option; colours `demandPresetColors` / `supplyPresetColors` in `palette.ts`, also shown in the list) picks the demand preset / the policy (it replaced
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
policy template against each demand's net totals, then tops up any year still short with the same `fillGreedy` step
(enabled sources only, respecting `maxGW`). `src/data/presets.test.ts` checks every preset covers its demand every year and
stays under `maxGW`. Don't hand-edit `scenarios/supply-*.json`; edit `policies/` and re-run.

**Legends** (`StackedAreaChart`): two plain ECharts legends under the plot (first `ceil(n/2)` names, then the rest).
The chart width is tracked with a ResizeObserver (rounded down to 8px steps, so resizing doesn't rebuild the chart every pixel); text is measured in the legend's font and labels that would make a
row wrap are truncated to a common cap (`legendTextCap`), with the full name in the legend tooltip.

**Units** (`uiStore.units`, top-bar `UnitsControl`, plan tab only; charts only, CSV/sliders/KPIs stay TWh/GW): a radio group in one
light embossed panel (`.embossed` in `TopBar.module.css`, also on the "פירוט" control) holding four embossed group boxes, each with its caption inside above its buttons, right to left: **אנרגיה** (שעט"ן, orange), **חשמל** (TWh/y, GW, blue), **גז**
(BCM, teal), **פליטות** (tCO₂eq, grape); captions and button text use the category colour (`--unit-*` in `UnitsControl.module.css`).
`twh` energy, `gw` firm GW vs. peak, `toe` primary energy in million שעט"ן (Mtoe), `bcm` gas burnt for power and `co2`
lifecycle emissions in million tCO₂eq (`EMISSION_FACTOR` in `model/fuel.ts`, Mt per TWh, IPCC AR5 medians as sample values;
storage and electricity import 0, unknown keys 0).
`model/fuel.ts`: `Mtoe = TWh / eff × 0.086`, `BCM = TWh / eff / 10.3` for `gas`/`lng` only; `PRIMARY_EFFICIENCY` per
source key (IEA convention: gas 0.5, coal 0.38, other fuels 0.4–0.5, nuclear/fusion 0.33, geothermal 0.1, solar/wind/
electricity import/unknown 1). The supply chart converts each source (in BCM only gas sources are stacked); its title reads "צריכת גז לפי מקור (BCM)" /
"פליטות לפי מקור (מיליון tCO₂eq)" in those modes. In BCM and tCO₂eq modes the **demand chart shows שעט"ן** (primary energy). Demand
sectors, the net-demand line, the reduction band and the demand compare line use `fuelRatios` = the year's supply mix
(converted total / supply TWh).

**Export**: CSV (UTF-8 with BOM, for Excel; text cells starting with `= + - @` get a leading `'` so Excel won't run them as
formulas) and PNG (2×, opaque background) from each chart card. Chart tooltips are HTML: names that come from files go
through `escapeHtml`. In `StackedAreaChart` the row of the band (or line, within 5px) under the pointer is
bold: a zrender `mousemove` handler finds it with `pickHovered` (interpolated between years, the reduction band first) and
sets `font-weight` on the tooltip rows (`data-tt-series`) directly, since ECharts doesn't rebuild an axis tooltip while the year
stays the same.

**Tracking** (`model/projects.ts`, `pages/TrackingPage.tsx`): an **energy-sources Gantt**. Every source of the
active supply scenario (all 14, enabled or not, in supply-panel order) is a row group; its tasks (e.g. יבוא LNG:
בחינת אתרים, תכנון סטטוטורי, יציאה למכרז, הקמה) are boxes with the task name inside (truncated to the box, full
text in the tooltip). Tasks are stored as `Project` items (internal name kept; `channel` = source key, `mw` optional).
`assignLanes` gives overlapping tasks of a source extra lanes (touching ≠ overlapping; a projected delay occupies
its lane; every source gets at least `MIN_LANES = 2` lanes so its KPI box fits). There is **no add button**; clicking
a box opens `ProjectEditor` to edit or delete that task. Instead of the source name, each row group starts (right side)
with a **KPI box** drawn in the chart canvas (a third `custom` series, id `kpi`, in the `grid.right` gutter, so it is in
the PNG; content top-aligned, name 14px / 12px narrow): colour square + name and status pills (בזמן / בסיכון / מתעכב counts; counts only on narrow screens), below
them the % and a progress bar on one line; left of it a narrow box with the new-GW target rotated 90°. The tooltip
on the box has the task count and the full target line. The reference-year selector (2035 / 2040 / 2050,
`uiStore.trackingYear`, persisted) sits above the KPI column: `GanttChart`'s `corner` prop, an HTML overlay in the
chart's top-right corner (`corner(narrow)` render prop): caption "שנת ייחוס" at the right, buttons at the KPI box's
left edge, 10px above the first box (`grid.top = TOP = 48`); on narrow screens no caption and the buttons span the
target box too. It is not in the PNG. The red "today" line's label sits above the axis years (`distance: 24`). The boxes count only the tasks planned to end by the end of
that year (`tasksDueBy`): `channelProgress` (duration-weighted mean progress), status counts, and the new-GW target
from `channelTargets(…, trackingYear)`. Series are addressed by id (`tasks` / `kpi`) in the tooltip and click handler. `onEvents` must stay a stable object
(echarts-for-react disposes and re-creates the chart when it changes); `onSelect` is read through a ref. The status and
owner filters scope both the task boxes and the KPI boxes. Projects persist version 3 (older state is replaced by the current sample tasks: long-term strategic tasks spread to 2050).
One collection-level `asOf` date drives both the "today" line and the status. Status = explicit `status` if set; else progress vs. expected
(linear in time): within 10 points on-track, within 25 at-risk, else delayed (`ON_TRACK_TOLERANCE`,
`AT_RISK_TOLERANCE`). `projectedEnd` extrapolates the current pace when behind (never before the
planned end; `null` with 0% progress more than 30 days after start). `channelTargets` = supply-scenario
capacity at the target year minus at the base year, via `sourceCapacity`, so a retired source has no target.
The Gantt is two ECharts `custom` series: alternating background bands per source group, then the task boxes
(source-colour fill, status-colour outline, thin striped progress strip, dashed extension to the projected end,
clipped at 2 years past the last planned end so the axis isn't stretched) and the `asOf` line.

**Trilemma** (`pages/TrilemmaPage.tsx`, third tab "טרילמת האנרגיה"): one card per source of the active supply scenario
(all 14, supply-panel order; 2 columns on phones up to 5 on wide screens). Each card draws the energy trilemma on three
axes (security up, affordability bottom-left, sustainability bottom-right; scores 0..10, the outer triangle is 10)
and the score triangle, the weighted score (`trilemmaMean`, ⅓ each, KPI-size number, no label, always near-black gray) at the top left,
and shows "יישימות: N%" below with a thin bar. Scores and feasibility are sample
values in `data/trilemma.ts`, editable in the priority tab (stored in `priorityStore`, not in files). Colours: hues evenly spaced by card index (`trilemmaHue`);
`feasibilityColor` lowers saturation (72% → 0) and raises lightness (48% → 80%) as feasibility falls, so low-feasibility
channels fade towards light gray. **Feasibility pyramid** (fourth tab "פירמידת יישימות", `/pyramid`, `TrilemmaPage pyramid` → `PyramidCard`): the same cards,
but each draws a 3D pyramid (`model/pyramid.ts`, orthographic view, by default rotated 20° about the vertical and tilted
atan ½ ≈ 27° above the horizon, so depth is ×sin and height ×cos): the base is the score triangle on the floor with the trilemma grid, the apex sits above the base centroid at
`H_MAX × feasibility`. A height axis rises from the centroid to 100% with ticks every 25% (dashed white inside the
pyramid, solid above the apex). Feasibility is encoded **only by height**: faces are solid in the card's hue, only
their lightness varies with the face normal, back faces are culled. **Drag to rotate and tilt:** in any card a horizontal drag
(pointer capture, ~0.8°/px) or ← / → (10°) turns the scene about the feasibility axis; a vertical drag or ↓ / ↑ tilts it
(`pitch`, clamped 0..80°): down brings the axis top toward the viewer (towards a top view), up towards a side view. Only these
two rotations, no free 3-axis roll. Double-click or Home resets to `DEFAULT_VIEW`. The SVG has `touch-action: none`, so on
phones the page scrolls only outside the pyramids. The view `{ yaw, pitch }` is one `useState` in `TrilemmaPage` (not
persisted) passed to every `PyramidCard`, so all cards move together. The pivot's height in the card (`pivotY`) centres the
axis, floor and labels for the current pitch, using the yaw-invariant reach from the centroid to the floor's outer vertices,
so nothing jumps while turning. Tick labels below 100% hide when ticks are closer than 8px; overlapping axis labels stack
(`placeLabels`). The pivot is the base centroid, drawn at the card centre, and
the floor grid and axis labels turn with it (labels pushed radially outward, anchor flipped near the card edges). The light
is fixed in camera space, so the face toward the viewer stays lit. Mouse-down doesn't focus the SVG (no focus ring after a drag). The card title and the weighted score are in the pyramid's colour (`hsl(hue 62% 46%)`), unlike the trilemma tab's gray score. The units control is hidden on this tab (and on tracking, which also has no scenario-name box in the top bar:
only ⚙); the ⚙ modal acts as on the plan tab.

**Channel priority** (`model/priority.ts`, `pages/PriorityPage.tsx`, second tab "תעדוף ערוצים", `/priority`): four
weights (sustainability = emission reduction, affordability, security, feasibility; `priorityStore.weights`, normalised to
sum 1) give each channel a merit `Σ w × score` (0..10; feasibility % / 10). Channels are ranked by merit (stable on ties).
`idealSupply` builds the ideal curve: the **existing fleet** (each source's base-year capacity, flat until its own
`retireYear`; a source with no fleet starts disabled), **early retirement** (fleet of a source with merit < `retireBelow`
ramps linearly to 0 by `retireByYear`; 0 = off; it stays in the ranking, so it is rebuilt only if the channels above it
can't cover), then `autoFill` with `fillPriority` = the ranking of channels with feasibility ≥ `minFeasibilityPct`, then
`topUpEveryYear`. **Start years:** channels with a long lead time have a range `{ earliest, realistic }`
(`defaultStartYears`: fusion 2035/2045, nuclear 2035/2042, geothermal 2035/2040, LNG 2035/2038, hydrogen 2032/2038,
clean fuels and electricity import 2030/2035, fossil-fuel import 2025/2025; others none). The effective year slides
linearly from earliest (normalised feasibility weight 0) to realistic (≥ `FEASIBILITY_WEIGHT_FULL = 0.5`); `autoFill`
and `topUpEveryYear` build nothing new in a channel before it (a zero point at `start − 1` keeps the ramp from leaking
earlier); the existing fleet is not affected. Only the priority tab uses them: the plan tab's auto-adjust and the presets
don't. Editable in the table (earliest / realistic, effective year below; clearing earliest removes the limit;
`priorityStore.startYears`, null = none). Caps are the tool's own (`defaultMaxGW` + edits in `priorityStore.maxGW`, null = none), replacing
the scenario's `maxGW`; without caps the top channel takes everything. Years still short are returned as `shortfall`
(red alert). The page shows the weights, the options, KPIs (emissions, mix merit, mix feasibility, renewable share) vs.
the active scenario, the ideal chart (active supply total as the dashed compare line) and the ranking table. Scores,
feasibility, caps and start years are editable there (persisted in `priorityStore`, Zod-validated; also used by the trilemma and
pyramid tabs through `useScoreOf`; "אפס ציונים, תקרות ושנים" restores the samples). "החל על תרחיש ההיצע הפעיל" writes the
ideal scenario to the active supply slot through `applyAutoFill`, so Undo works. Scores are not saved in scenario files yet.

## Conventions

- **PRs:** when the user asks to open a PR and/or merge it into `main`, just do it: no plan-approval step or
  confirmation is needed for creating a PR or merging it into `main`.
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
  installed GW in the horizon year (`scaleCapacityFrom`: every anchor from 2030 to the horizon scales by the same
  factor, so 2030 and 2050 move proportionally; earlier points stay; a 2030 point is added if missing). Reduction sliders (`centered={false}`) start at 0.
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
- **Shared helpers before new ones:** number/text formatting in `utils/format.ts`, small math in `model/math.ts`, ECharts
  theme and text measurement in `charts/echartsCore.ts`. UI strings that quote a model constant take it as a parameter
  (e.g. `autofill.explain(AUTOFILL_STEP_YEARS, FIRM_CREDIT_MIN)`), so the text follows the code.
- Code style: single quotes, 2-space indent, lines up to ~120 characters (there is no Prettier config, so don't run
  Prettier with its defaults). Exported functions, components and types get a short JSDoc comment (Hebrew, like the
  rest of the code).
- Baseline data is **sample data**: the UI labels it as such. It lives in `src/data/` (bundled
  and validated at import) rather than `public/data/` as the design doc first proposed.

## Where to view it

- **GitHub Pages** (once Pages is enabled with Source = GitHub Actions; deploys from the default branch):
  https://shahardo.github.io/EnergyFollowupDashboard/
- **claude.ai Artifact** (private): built from `dist/`. The page is a copy of `dist/index.html`
  without the document skeleton, with `dist/assets/*` published alongside. Republish after each
  significant change. Always publish **every** file in `dist/assets/` and remove the old names: the vendor chunks
  (`mantine-*`, `echarts-*`) and the CSS can get new hashes too, and a missing chunk leaves a blank page.

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
`{ id, name, asOf, projects }`: one `asOf` for the whole list instead of one per project. Each item is a task in
the Gantt row of its `channel` (source); `mw` is optional, so older project files still load.

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
the gray page); 9 supply presets, three per demand preset, each meeting its demand. Preset selectors moved into the
chart cards' title rows; units control gained שעט"ן (primary energy) and BCM (gas consumption). Efficiency and saving
(band and sliders) moved back to the demand side.

**Energy-sources Gantt: done.** The tracking tab's projects Gantt became a Gantt of the 14 supply sources with
labelled task boxes, extra lanes for overlapping tasks, no "add" button (click edits a task), and source cards
showing task progress and the new-GW target. Source cards moved below the Gantt, with a 2035/2040/2050
reference-year control that scopes them to the tasks due by that year. The cards then moved into the Gantt itself:
a compact KPI box (name, status pills, % + bar) at the right of each source's rows, with a rotated new-GW target box.

**Energy trilemma tab: done.** A card per supply channel with its trilemma triangle (security / affordability /
sustainability, 0–10) and feasibility %, colours fading towards light gray as feasibility drops (sample values).
Weighted trilemma score at each card's top left; coloured inset squares in the scenario selectors; units control
grouped and coloured by category (energy / electricity / gas).

**Feasibility pyramid tab: done.** A fourth tab with a 3D pyramid per channel: trilemma triangle as base,
feasibility as height, a ticked height axis, solid colours. Drag in any card (or arrow keys) rotates all the pyramids
together about the feasibility axis (left/right) and tilts the axis toward the viewer (up/down).

**Channel priority tab: done.** Weights (emissions / price / security / feasibility) rank the 14 channels; an ideal
supply curve is built from the existing fleet by the ranking, with a feasibility threshold for new build, early
retirement of low-merit fleet, editable scores / feasibility / caps, KPIs vs. the active scenario, and "apply" (with undo).
Per-channel start years (earliest / realistic, slid by the feasibility weight) keep long-lead channels out until then.

**Not yet built:**
- Phase 4: hourly profile, sensitivity analysis.
- Playwright e2e tests (the save → open → same results flow was verified manually).

Known quirk: in this container's headless Chromium, a Hebrew download filename falls back to
`download`. English names keep their name; not yet checked in a regular browser.

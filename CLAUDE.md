# CLAUDE.md

Guidance for Claude (and humans) working in this repository.

> **Keep this file current.** Update it in the same commit as any significant change:
> a new feature or screen, a change to the data schema or file format, a new dependency,
> a change to the folder structure, the commands, or the conventions below.
> Update the **Status** section whenever a roadmap phase item lands.

## What this is

A Hebrew/RTL dashboard for planning Israel's energy system: demand by sector → supply by source → execution
tracking. The dashboard is static and runs entirely in the browser; an **optional Python server** (`backend/`) adds a
reference Python engine, saved scenarios and background **OSeMOSYS** optimisation runs on a model generated from the
dashboard's own data (laid out like [osemosys_israel](https://github.com/shahardo/osemosys_israel), and exportable to it),
and is hosted on Google Cloud Run (Hugging Face made Docker Spaces paid in 2026). **All data is in base SI units** (J, W, kg, m³, $, fractions); only the UI, CSV
and KPIs convert to TWh / GW / Mtoe / BCM / Mt / %. The full design is in
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
| `npm run goldens` | Rewrite `backend/tests/goldens/*.json` (TS engine outputs for every preset pair) after changing a calculation |
| `npm run schema` | Rewrite `backend/tests/zod-schema.json` after changing a Zod schema (then mirror it in `backend/energy_model/schema.py`) |
| `npm run api` | The Python server at http://localhost:8000 (needs `backend/.venv`: `python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"`); `npm run dev` proxies `/api` to it |
| `npm run test:py` | pytest (ruff: `cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .`) |
| `python -m energy_model.fit_presets [--check]` | (in `backend/`) the Python twin of `fit:supply`; `--check` = byte-identical to the committed presets |
| `python -m energy_model.osemosys.export --demand medium --policy declared --out <dir>` | (in `backend/`) write the generated OSeMOSYS model in osemosys_israel's layout (`osemosys_data_yaml/israel_energy_model.yaml` + README) |
| `docker build -t energy-dashboard .` | The server image (listens on `$PORT`, default 7860); deployed with `gcloud run deploy --source .` |

CI (`.github/workflows/ci.yml`) runs lint, test, and build, a **python** job (ruff, `fit_presets --check`, pytest
including real OSeMOSYS solves) and a **docker** job (builds the image from the repo root and smoke-tests it on
`PORT=8080`) on every push and PR, and deploys `dist/` to GitHub Pages on push to the repo's **default branch** (built
with `VITE_API_URL = vars.API_URL`, so Pages can use the server). `deploy-cloud-run.yml` deploys to Google Cloud Run after
CI passes on the default branch (Workload Identity Federation; repo variables `GCP_PROJECT`, `GCP_REGION`,
`GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `STATE_BUCKET`; secret `run-token` in Google Secret Manager;
skipped without `GCP_PROJECT`; one-time setup in `deploy/cloud-run/SETUP.md`). `main` is the primary branch
and should be set as the default in the repo settings.

## Stack

React 18 + TypeScript + Vite · Mantine 7 (UI, RTL via `DirectionProvider`) · ECharts 5
(`echarts-for-react`, tree-shaken through `echarts/core`) · Zustand 5 with `persist` · Zod 3 ·
`browser-fs-access` · React Router 6 (`HashRouter`) · Vitest.
Backend: Python 3.12 · FastAPI + uvicorn · Pydantic 2 · tz-osemosys 0.4.1 (linopy) + HiGHS (`highspy`) ·
google-cloud-storage (state mirror) · pytest + ruff. Docker (one image: Node build stage → Python runtime, port `$PORT`, default 7860) on Google Cloud Run.

## Layout

```
src/
  schema/index.ts        Zod schemas = the single source of the data types (z.infer)
  data/                  catalog.json + catalog.ts: the shared sector / sub-sector / source catalogue (dashboard key ↔ OSeMOSYS
                         demand commodity + end-use `kind`, or technology id + `output`; split sectors with their parent and shares;
                         also read by the Python backend; each source has a display `category`, ordered by `sourceCategories`;
                         catalog.ts: sourceCategories, categoryOf, topSectorOf, sectorOfCommodity); energySystem.json: the rest of the OSeMOSYS input (timeslices, profiles,
                         fuel imports, fuel blends, end-use technologies per kind, discount rate, reserve margin, emission penalty);
                         scenarios/*.json: preset scenarios (sample values) as ScenarioFile JSON: demand-low/medium/high
                         and 9 GENERATED supply-<demand>-<policy>.json; scenarioPlan.ts (planPresets: rule params per policy, planParamsOf); trilemma.ts (sample trilemma scores + feasibility per
                         source key, scoreFor falls back to `other`; defaultMaxGW, weightPresets, defaultWeights, defaultStartYears for the priority tab); policies/supply-<policy>.json: the 3 policy
                         templates they are fitted from; baseline.ts (demandPresets, supplyPresets[demand][policy],
                         baselineDemand = medium, baselineSupply = medium/declared, baselineProjects);
                         upgradeSupply.ts / upgradeDemand.ts (bring older saved scenarios up to a preset's lists; both use
                         mergeByBaseline.ts: add missing items, stable sort into baseline order)
  model/                 Pure calculation engine — NO React, NO stores
    units.ts             SI constants (SECONDS_PER_YEAR, J_PER_TWH, W_PER_GW, J_PER_TOE, KG_PER_MT, M3_PER_BCM, J_PER_M3_GAS),
                         energyOf / powerOf, display converters toTWh/fromTWh, toGW/fromGW, toMW, toMtoe, toBCM, toMt, toPct/fromPct
    years.ts             yearRange (re-exports SECONDS_PER_YEAR)
    math.ts              clamp, linearShare (0..1 ramp), POWER_STEP (1e7 W = 0.01 GW), roundUpPower / roundPower, round2
    series.ts            computeDemandSeries (sectors → gross → measures → net) and computeSeries (+ supply, gap):
                         the whole chain, used by useSeries and the fit script
    demand.ts            sectorTWh, projectDemand, demandTotals, peakFromEnergy
    supply.ts            interpolateCapacity, sourceEnergy (W × CF × SECONDS_PER_YEAR), sourceCapacity, computeSupply, setCapacityAt, scaleCapacityFrom (slider: scales
                         every anchor from SCALE_FROM_YEAR = 2030 to the horizon by new/old horizon value)
    measures.ts          rampShare, applyMeasures, netTotals (energy efficiency + energy saving)
    sliderRange.ts       centeredRange (slider range with the base value exactly in the middle)
    gap.ts               computeGap
    fuel.ts              sourceMtoe, sourceBcm, sourceMtCo2, fuelRatios (primary energy in Mtoe/שעט"ן, gas in BCM, emissions in Mt CO₂eq)
    carriers.ts          projectNonElectric (non-electric demand per sector: base × growth − electrifyOffset × added electricity),
                         measureNonElectric (same measures as electricity), fuelShares / fuelSupplyPoints (clean / hydrogen / fossil)
    scenarioPlan.ts      planCapacity, rampCapacity, planCurve, refillGas, applyPlanRule / applyPlanRules (write rule curves into a supply
                         scenario, gas fills the rest), ruleMatches, planSupply (the "תכנון תרחישים" chart data, curtailed at demand)
    autofill.ts          fillGreedy (the one greedy step: energy by fillPriority, then peak firm-first), autoFill,
                         autoFillYears, autoAdjust (fill + proportional scale-down), topUpEveryYear (fills gaps left between anchors);
                         autoFill / topUpEveryYear take optional { startYear } (no new build in a source before it)
    priority.ts          normalizeWeights, meritScore, rankSources, existingFleet, effectiveStartYear / startYearsFor,
                         idealSupply (the priority tab's ideal curve),
                         mixMetrics (energy-weighted mix scores + emissions per year)
    groups.ts            SeriesGroup / GroupLeaf, flattenGroups (collapsed group = one band, expanded = its items in shades),
                         groupBy, groupTotal, isExpandable (two detail levels in the charts)
    trilemma.ts          TrilemmaScore, axisPoint, trianglePoints, trilemmaHue, feasibilityColor
    pyramid.ts           groundPoint, project (orthographic: yaw about a pivot + pitch above the horizon; DEFAULT_VIEW = YAW 20°,
                         PITCH atan ½), viewDir, normalizeYaw, clampPitch (0..80°), buildPyramid (faces, culling, yaw-relative light)
    projects.ts          PROJECT_STATUSES, parseDate/formatDate, expectedProgress, projectStatus, projectedEnd, assignLanes, channelProgress, tasksDueBy, channelTargets
  store/                 Zustand stores (demand, supply (also setPlanParam for the scenario-planning rules), projects, ui, compare, priority: weights, options, edited trilemma
                         scores and caps; useScoreOf) + useSeries (derived data, memoised at module
                         level on the two scenario objects, so every caller shares one computation); usePlanSeries (useNonElectric, usePlanSupply,
                         same module-level memo)
  utils/format.ts        fmt, fmtPct, ltr (LTR isolate), escapeHtml (for ECharts tooltip HTML)
  io/                    scenarioFiles.ts (save/open/validate, isAbort, safeFileStem/safeFileName), useScenarioActions.ts (UI wiring),
                         csvExport.ts (pure CSV builders), download.ts (file or dialog),
                         exportDialog.ts (state of the "copy text / save image" dialog used when embedded)
  components/
    charts/GroupToggles.tsx  GroupToggles (triangle handles under a chart without a panel: priority, optimisation),
                         useGroupBands (groups → bands under the shared expand state)
    charts/              StackedAreaChart, GanttChart (energy-sources Gantt with a KPI box per source; both: ref → toPng), ChartCard (title, `controls`
                         slot, CSV/PNG/טבלה, compare chip; the chart goes in as children), palette, echartsCore.ts (ChartHandle,
                         themeColors, BASE_OPTION, textWidth with the page font read once, useChartPng)
    charts/patterns.ts   striped canvas fill (reduction band, Gantt progress)
    charts/legend.ts     splitLegend, legendTextCap (two-row legend under the chart, no scrolling)
    charts/hover.ts      stackBands, pickHovered (which band / line is under the pointer: bolds its tooltip row)
    charts/scale.ts      niceAxisMax (round axis top + interval), seriesMax (highest drawn point); sharedScale.ts: SharedScaleProvider +
                         useSharedScale (charts with the same unit inside one provider share the Y-axis top)
    controls/            CenteredSlider (+ .module.css, useSingleGear: one open gear per list), inputs.tsx (numOr, ColorSquare),
                         Disclosure (+ .module.css: a collapsible section behind a rotating-triangle handle),
                         Slider.module.css (global slider style),
                         SectorDetails, SourceDetails (gear content), AutoFillPanel, ProjectEditor,
                         GroupCell (+ .module.css: a full-width group row with its items indented below in two columns; SummaryRow: a row without
                         a slider); Disclosure.tsx also exports DisclosureHandle (bare triangle) and DisclosureToggle
    plan/                demandSeries.ts (useDemandChart: the demand chart's series for both tabs: sectors / carriers view, fuel scope),
                         demandGroups.ts (demandGroups, topSectors), supplyGroups.ts (sourceCategoryGroups, categoryTotals,
                         supplyCarrierGroups), DemandParams / SupplyParams (the grouped parameter panels),
                         PlanSupplyColumn (the new tab's supply chart + rule sliders), DemandColumn, SupplyColumn (chart + parameter panel each; the preset Select, ScenarioSelect.tsx, and the
                         view Select, ViewSelect.tsx (see "View selector"), sit in the
                         chart card's title row, between the title and CSV/PNG/טבלה, with a ScenarioSwatch instead of the chevron),
                         unitSeries.ts (unitInfo, ratioOf, useUnitFactor, modeNote), MeasuresPanel
                         (efficiency/saving sliders: demand-scenario values, in the demand panel under the sectors)
    trilemma/            TrilemmaCard (inline SVG: 3 axes, 25/50/75/100% grid, score triangle, "יישימות:" + bar),
                         PyramidCard (3D pyramid: the score triangle as base, height = feasibility, ticked height axis),
                         parts.tsx (shared: GRID, pts, strokes, CardHeader, AxisLabel, FeasibilityLine), trilemma.module.css
    layout/              TopBar (+ .module.css: one row = title, tabs, controls at the far left; on phones the tabs
                         drop to their own row; the active tab is tinted --page-tint and merges into the page),
                         UnitsControl (+ .module.css: units grouped אנרגיה | חשמל | גז | פליטות), ActionsModal (⚙: save/open/compare/duplicate/reset cards), icons (inline SVG),
                         KpiCard, ExportDialog, ConfirmBody (the confirm dialog body for reset / delete)
  components/optimize/   RunLog (live solver output, displayLog), RunParametersPanel + paramTables.ts (the run's model parameters)
  components/priority/   PriorityControls (WeightsPanel, OptionsPanel), RankingTable (editable scores / feasibility / caps)
  pages/                 PlanPage (demand + supply side by side; /demand and /supply redirect here), ScenarioPlanPage (/scenarios), PriorityPage (/priority), TrackingPage,
                         TrilemmaPage (/trilemma, 2D or 3D by `uiStore.trilemmaView`; /pyramid switches to 3D and redirects there)
  i18n/he.ts             Every user-visible string
  api/client.ts          The optional server's client (health, auto-adjust, scenarios, OSeMOSYS runs); base = VITE_API_URL or same origin
  store/apiStore.ts      Server status (checked once on load), the run token (persisted)
  pages/OptimizePage.tsx The "אופטימיזציה (OSeMOSYS)" tab (/optimize, only when the server answers)
backend/                 The Python server (see "Python backend" below)
  energy_model/          Python engine: core, demand, supply (+gap, series), fuel, plan (carriers + scenario rules), autofill,
                         priority (1:1 ports of src/model), data (reads src/data JSON), schema (Pydantic mirror of Zod),
                         jsjson (JSON.stringify-compatible writer), fit_presets
  energy_model/          units (SI constants), migrate (v1 → v2 files, twin of src/io/migrateV1.ts), schema_v1 (the old schema)
  energy_model/osemosys/ build (the model from scenarios + catalog + energySystem.json), solve (results in SI; stage lines to stdout),
                         params (the model's parameters as tables, saved with each run), export
  api/                   main (FastAPI app, serves dist/), deps (settings from env, token check), store (JSON files + GCS bucket mirror),
                         runner (queued solves in child processes), routes/ (compute, scenarios, osemosys)
  tests/                 test_goldens (parity with TS), test_schema, test_engine, test_osemosys, test_api, test_deploy; goldens/, zod-schema.json
Dockerfile, .dockerignore, .gcloudignore (keep the two in step), deploy/cloud-run/SETUP.md, scripts/ (export-goldens.ts,
                         export-schema.ts, fit-supply-presets.ts, migrate-data-v2.ts: the one-off v1 → SI data conversion, kept for record)
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

Key formulas (SI): `peak[W] = E[J] / (SECONDS_PER_YEAR × loadFactor)`; `E[J] = P[W] × CF × SECONDS_PER_YEAR`;
`firm[W] = P × capacityCredit` (SECONDS_PER_YEAR = 8760 h × 3600 s). Total peak demand is the **sum** of sector peaks (conservative:
it assumes the sector peaks coincide). The S-curve reaches the same horizon value as `exp`,
with its inflection at `sMidYear`.

**Auto-fill** (`model/autofill.ts`): at anchor years every 5 years (plus the horizon), first close
the energy gap walking `fillPriority` (sources with CF > 0), then the peak gap: firm sources
(`capacityCredit ≥ FIRM_CREDIT_MIN = 0.5`) first, low-credit ones only after. Each source is capped
by its optional `maxPower` (also when its base capacity rises after an earlier addition: the carried addition shrinks). Built capacity never shrinks between anchors; values round **up** to 0.01 GW
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
(and `demandPreset` for supply, which also switches the demand), else to the active one. Persist versions: demand 3,
supply 4 (older supply state goes into the medium-demand row; 3 → 4 only adds the new sources through `upgradeSupply`),
projects 4 (a version-3 list is kept and gets the sample tasks of sources that have none). Slider centres come from the active preset. Presets
carry no `demandScenarioRef`, so the mismatch warning doesn't fire.
**Supply presets are generated**: `scripts/fit-supply-presets.ts` (`npm run fit:supply`) takes each policy template, sets
`planParams = planPresets[policy]` and runs `applyPlanRules` against each demand's net totals: the six rule sources (solar,
solar 30%, solar 40%, electricity import, geothermal, fusion) get their rule curves (yearly points, capped at `maxPower`), the
other sources keep the template curves, and gas fills the rest (`refillGas`, energy and peak). `src/data/presets.test.ts` checks every preset covers its demand every year and
stays under `maxPower`. Don't hand-edit `scenarios/supply-*.json`; edit `policies/` and re-run.

**Legends** (`StackedAreaChart`): two plain ECharts legends under the plot (first `ceil(n/2)` names, then the rest).
The chart width is tracked with a ResizeObserver (rounded down to 8px steps, so resizing doesn't rebuild the chart every pixel); text is measured in the legend's font and labels that would make a
row wrap are truncated to a common cap (`legendTextCap`), with the full name in the legend tooltip.

**Two detail levels** (`model/groups.ts`, `uiStore.expanded`): every demand / supply chart and parameter panel shows
groups first, each with a triangle handle (`DisclosureHandle`) that expands it; an expanded group's chart bands are drawn
in shades of its colour (`shadesOf` in `palette.ts`). The expand state is one persisted list of namespaced keys shared by
every tab: `sector:<key>` (demand main sector), `dcarrier:<c>` (demand carrier), `cat:<category>` (supply category),
`scarrier:<c>` (supply carrier). Demand, sectors view: the main sectors (no catalogue `parent`; the heat sectors fold into
their parents) expand to "<sector> חשמל / דלקים / גז" + the split child (transport: its sub-sectors' electricity + fuels;
this replaced the old "split transport" checkbox). Demand, carriers view: electricity / fuels / gas expand to each main
sector's share. Supply, sources view: the catalogue categories (gas, coal, solar, wind, geothermal, storage, nuclear,
fusion, electricity import, hydrogen, fuel imports, other; a one-source category is just that source); on the scenario
tab the fuel bands form a `scarrier:fuels` group. Supply, final-energy view: electricity → categories, fuels → clean /
hydrogen / fossil, direct gas. Panels: a group row keeps an **aggregate slider**: demand shifts every growth rate in the
group by the same percentage points (mean shift vs. the preset at the centre; `demandStore.updateSectors`); supply scales
every enabled source's horizon GW by one factor and has an "enable all" checkbox (`supplyStore.updateSources`); the
scenario tab's solar group scales the three solar slopes (`supplyStore.setPlanParams`). Gas (demand) and fuels / gas
(supply, plan tab) are summary rows: gas grows with the fuels rate, the fuel mix is set on the scenario tab. Panel layout: every top-level row (a group or a single item) gets its own line, one under the other, held to half the
width (`HalfRow`) so its slider is as short as the items'; an expanded
group's items open below it, indented, in two columns (`GroupCell`; `columns={1}` when the items are groups themselves,
as under the supply חשמל row in the final-energy view). The priority
and optimisation charts have no panel, so `GroupToggles` sits under them. CSV / טבלה exports stay per item.

**Shared Y scale**: `PlanPage` and `ScenarioPlanPage` wrap the demand + supply charts in `SharedScaleProvider`. Each
`StackedAreaChart` reports its `seriesMax` under its unit and uses `niceAxisMax` of the largest one with the same unit
(`yAxis min 0 / max / interval`), so both charts have the same top. Charts in different units (BCM / tCO₂eq supply vs.
the demand chart in שעט"ן) keep their own scale; a chart outside a provider (the priority tab) scales itself.

**View selector** (`components/plan/ViewSelect.tsx`, passed as `ChartCard`'s `titleControls` — right next to the title, not
in the `controls` slot where the preset `ScenarioSelect` sits, so it stays close instead of floating off with the
`justify="space-between"` gap): every demand chart's title is just "ביקוש לפי:" and every supply chart's "אספקה לפי:",
followed by a small `Select` instead of a fixed title suffix, its width computed from the longest option's text
(`textWidth` from `echartsCore.ts`) so it isn't wider than it needs to be. Demand (`uiStore.planView`, default `carriers`):
**מגזר** (per-sector stack) or **מקור אנרגיה**
(collapses to the electricity / fuels / gas carrier bands, `carrierColors`, as `useDemandChart`'s `view='carriers'` already
did). Supply (`uiStore.supplyView`, default `sources`): **ערוץ אספקה** (today's per-source stack) or **אנרגיה סופית** (the
same three carrier bands, summed on the fly in `SupplyColumn` / `PlanSupplyColumn` — not a stored series). Both settings
are persisted and shared by every tab (plan and scenario-planning), so picking a view in one chart shows it in the
matching chart elsewhere too; there is no separate "תצוגה" control in the top bar.

**Units** (`uiStore.units`, default `toe`, top-bar `UnitsControl`, plan and scenario-planning tabs; charts only, CSV/sliders/KPIs stay TWh/GW): a radio group in one
light embossed panel (`.embossed` in `TopBar.module.css`, also on the "פירוט" control) holding four embossed group boxes, each with its caption inside above its buttons, right to left: **אנרגיה** (שעט"ן, orange), **חשמל** (TWh/y, GW, blue), **גז**
(BCM, teal), **פליטות** (tCO₂eq, grape); captions and button text use the category colour (`--unit-*` in `UnitsControl.module.css`).
`twh` energy, `gw` firm GW vs. peak, `toe` final energy in million שעט"ן (Mtoe), `bcm` gas burnt for power and `co2`
lifecycle emissions in million tCO₂eq (`EMISSION_FACTOR` in `model/fuel.ts`, Mt per TWh, IPCC AR5 medians as sample values;
storage and electricity import 0, unknown keys 0).
`model/fuel.ts`: `Mtoe = TWh / eff × 0.086`, `BCM = TWh / eff / 10.3` for `gas`/`lng` only; `PRIMARY_EFFICIENCY` per
source key (IEA convention: gas 0.5, coal 0.38, other fuels 0.4–0.5, nuclear/fusion 0.33, geothermal 0.1, solar/wind/
electricity import/unknown 1). The supply chart converts each source (in BCM only gas sources are stacked); its footer note explains the mode (BCM: gas
burnt for power; tCO₂eq: lifecycle emissions) since the title itself ("אספקה לפי:", see **View selector** below) no longer names the unit. In BCM and
tCO₂eq modes the **demand chart shows שעט"ן**. **שעט"ן is final energy in both charts** (TWh × 0.086:
`useDemandChart`, and `SUPPLY_VALUE.toe` / `ratioOf('toe')` in `unitSeries.ts`), so the supply chart's demand line equals
the demand chart's net line and never moves with the supply mix; plant losses are not counted (`sourceMtoe` /
`PRIMARY_EFFICIENCY` remain in `fuel.ts` but the charts don't use them). BCM / tCO₂eq still use `fuelRatios` (the mix).
**Total-energy unit menu** (`uiStore.energyUnit`: `mtoe` default / `pj` / `twh`, persisted, shared by every tab): every
**total-energy** chart (the plan / scenario-planning charts in `toe` mode, the demand chart also in BCM / tCO₂eq mode, and the
optimisation tab's final-energy chart) shows `EnergyUnitSelect` (`components/charts/`) in place of its Y-axis name:
`StackedAreaChart`'s `unitMenu` prop places it over the axis-name spot and draws the ECharts axis name transparent;
`useChartPng(…, showAxisName)` makes the name visible just for the PNG. The `toe` mode's factor and label come from
`energyFactor` / `energyUnitInfo` in `unitSeries.ts` (an optional `energyUnit` argument on `unitInfo`, `ratioOf`,
`supplyValue`, `fuelValue`, `useUnitFactor`, `energyDisplayFactor`), and the top bar's energy button shows the unit's short
name. **Electricity charts keep a fixed "TWh"** (the TWh/y mode, the priority tab, the optimisation tab's generation chart).

**Export**: PNG (2×, opaque background), CSV (UTF-8 with BOM, for Excel; text cells starting with `= + - @` get a leading
`'` so Excel won't run them as formulas) and **טבלה**, in that order (left to right — first in the RTL row is rightmost,
so the DOM order is טבלה, CSV, PNG) from each chart card (`ChartCard`): טבלה parses the same CSV text (`io/csvExport.ts:
parseCsv`, handles quoted cells) into a `Table` in a modal (small font, `fz="xs"`), numeric cells shown LTR; no extra data
plumbing per chart. The year column (always first) is bold and frozen — `position: sticky; right: 0` (a physical `right`,
not the logical `insetInlineStart`, because a numeric cell's own `direction: ltr` for left-aligning its digits would
otherwise flip what the logical property means for that cell) — like the header row, which needs its own scroll container
to actually be the one that scrolls horizontally: a plain `overflow: auto` div, not `ScrollArea.Autosize` (its width
doesn't shrink to its parent, so the **Modal** ends up scrolling instead, and sticky position is relative to the wrong
element). Chart tooltips are HTML: names that come from files go
through `escapeHtml`. In `StackedAreaChart` the row of the band (or line, within 5px) under the pointer is
bold: a zrender `mousemove` handler finds it with `pickHovered` (interpolated between years, the reduction band first) and
sets `font-weight` on the tooltip rows (`data-tt-series`) directly, since ECharts doesn't rebuild an axis tooltip while the year
stays the same.

**Tracking** (`model/projects.ts`, `pages/TrackingPage.tsx`): an **energy-sources Gantt**. Every source of the
active supply scenario (all of them, enabled or not, in supply-panel order) is a row group; its tasks (e.g. יבוא LNG:
בחינת אתרים, תכנון סטטוטורי, יציאה למכרז, הקמה) are boxes with the task name inside (truncated to the box, full
text in the tooltip). Tasks are stored as `Project` items (internal name kept; `channel` = source key, `power` optional).
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
owner filters scope both the task boxes and the KPI boxes. Projects persist version 4 (a version-3 list is kept and gets the sample tasks of sources without any; older state is replaced by the current sample tasks: long-term strategic tasks spread to 2050).
One collection-level `asOf` date drives both the "today" line and the status. Status = explicit `status` if set; else progress vs. expected
(linear in time): within 10 points on-track, within 25 at-risk, else delayed (`ON_TRACK_TOLERANCE`,
`AT_RISK_TOLERANCE`). `projectedEnd` extrapolates the current pace when behind (never before the
planned end; `null` with 0% progress more than 30 days after start). `channelTargets` = supply-scenario
capacity at the target year minus at the base year, via `sourceCapacity`, so a retired source has no target.
The Gantt is two ECharts `custom` series: alternating background bands per source group, then the task boxes
(source-colour fill, status-colour outline, thin striped progress strip, dashed extension to the projected end,
clipped at 2 years past the last planned end so the axis isn't stretched) and the `asOf` line.

**Trilemma** (`pages/TrilemmaPage.tsx`, tab "טרילמת האנרגיה"): one card per source of the active supply scenario
(all 14, supply-panel order; 2 columns on phones up to 5 on wide screens). Each card draws the energy trilemma on three
axes (security up, affordability bottom-left, sustainability bottom-right; scores 0..10, the outer triangle is 10)
and the score triangle, the weighted score (`trilemmaMean`, ⅓ each, KPI-size number, no label, always near-black gray) at the top left,
and shows "יישימות: N%" below with a thin bar. A 2D / 3D toggle at the left end of the tab's title row (`uiStore.trilemmaView`, persisted)
switches the same tab between these cards and the feasibility pyramids below. Scores and feasibility are sample
values in `data/trilemma.ts`, editable in the priority tab (stored in `priorityStore`, not in files). Colours: hues evenly spaced by card index (`trilemmaHue`);
`feasibilityColor` lowers saturation (72% → 0) and raises lightness (48% → 80%) as feasibility falls, so low-feasibility
channels fade towards light gray. **Feasibility pyramid** (the trilemma tab in 3D, `PyramidCard`; it was a separate tab, and the old
`/pyramid` link now sets 3D and redirects to `/trilemma`): the same cards,
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

**Non-electric demand** (`SectorDemand.nonElectric`, optional: `{ fuels, gas (J), growthRate, electrifyOffset? }`, sample
values in every demand preset): final-energy fuels and direct gas per sector; transport fuels shrink by `electrifyOffset` (2.5)
TWh per TWh of added transport electricity, floored at 0; the scenario's efficiency/saving apply too. `upgradeDemand` fills a
missing `nonElectric` from the preset and renames the legacy label "תחבורה (חשמול)" to "תחבורה". In the plan tab, when the
demand chart shows שעט"ן (toe / BCM / tCO₂eq modes), **every** sector's fuels and direct gas go in (fuel Mtoe = TWh × 0.086,
`FuelScope = 'all'`), combined with its electricity into one stacked layer; transport alone still splits into "תחבורה חשמל" +
"תחבורה דלקים" since it's the one sector shown broken out. The supply chart (toe / CO₂) adds the same combined non-electric
demand to the יבוא דלקים נקיים / מימן / פוסיליים bands (shown even when disabled for power), split by the new tab's fuel-mix
params; its demand line includes them. The demand parameter panel gives every sector with non-electric demand a second
slider, right below its electricity growth slider, for its own `nonElectric.growthRate` (no side note, unlike the electricity
slider's vs.-base delta). `FuelScope` is `'none'` (TWh/GW, the "חשמל" unit group: electricity only) or `'all'` (toe mode
only); `DemandColumn` is shared as-is by both tabs (no prop), so this panel is identical there too.

**Scenario planning** (`pages/ScenarioPlanPage.tsx`, second tab "תכנון תרחישים", `/scenarios`): the plan tab's
`DemandColumn` (shared demand store, identical to the plan tab's) on the right, `PlanSupplyColumn` on the left. **Both
tabs share one supply**: the active `supplyStore` slot. Each chart's own view selector (see **View selector** above)
controls its stacking here too, shared with the plan tab. In toe/bcm/co2 mode (not TWh/GW, the "חשמל" unit group, which
stay electricity-only like the plan tab) the supply chart draws clear carrier bounds: dashed `bounds` lines for
electricity demand and electricity + fuels, each with a short end label (`tag`,
ECharts `endLabel`, overlaps shifted; the grid's right margin grows to fit), and the solid total line tagged "+ גז = כולל":
direct gas is the top band, so the total line is the gas bound and gas has no line of its own. A bound that coincides
with another (fuels in BCM) is dropped. The supply chart card has the **same policy menu as the
plan tab's supply chart** (`ScenarioSelect`, same selection). The rule params live in the supply scenario
(`SupplyScenario.planParams`, optional; `upgradeSupply` fills it from the preset, `planParamsOf` falls back to
`planPresets[preset]`), so they follow both menus, are saved in files and reset with the slot. A rule slider calls
`supplyStore.setPlanParam(group, patch, totals)`: for an electricity rule it rewrites that source's curve (`applyPlanRule`)
and refills gas; other sources (also ones edited in the plan tab) are kept; fuel-share sliders change only `planParams`.
So a new-tab slider shows at once in the plan tab, and a plan-tab edit / auto-adjust / file open shows at once here; a rule
source edited in the plan tab (`!ruleMatches`) shows "נערך בטאב תרחישי ביקוש ואספקה" by its slider. Gas is refilled only by
new-tab sliders. The chart (`planSupply`) is built from the scenario: rule sources first, then the other enabled sources,
gas last, each curtailed at the uncovered demand; a power source with a fuel key is labelled "… (חשמל)". Solar 30% / 40%
are supply sources (`solar30`, `solar40`, in the policy templates, with sample Gantt tasks). Declared defaults: electricity bottom-up: solar
(base + 1 GW/y), solar 30% (from 2030, 0.5 GW/y), solar 40% (from 2035, 0.5 GW/y; same CF as solar), electricity import
(1 GW in 2030, +1 every 5 years, 4 steps, linear between), deep geothermal (from 2035, slow: 10-year arc to 0.2 GW/y) and
fusion (from 2040, 5-year arc to 0.5 GW/y). **The stack never exceeds demand**: each source delivers at most the energy and
firm peak still uncovered (surplus curtailed from the top; `gw` stays installed), and **gas fills the rest**
(`gw = max(twh/(CF·8.76), peakLeft/credit)`), so the electricity stack ends exactly on the electricity-demand line. Fuels: clean fuels (from 2030, to 20% of fuel
demand at the horizon) and hydrogen (from 2040, to 10%), fossil-fuel import fills the rest; direct gas = its demand. Fuel
units (`fuel.ts`: `fuelMtoe`, `fuelBcm`, `fuelMtCo2` with combustion factors) have no plant efficiency. Every rule has a
slider (main value; start year / ramp / steps behind ⚙) and a reset button. No KPI cards there yet.

**Channel priority** (`model/priority.ts`, `pages/PriorityPage.tsx`, third tab "תעדוף ערוצים", `/priority`): four
weights (sustainability = emission reduction, affordability, security, feasibility; `priorityStore.weights`, normalised to
sum 1) give each channel a merit `Σ w × score` (0..10; feasibility % / 10). Channels are ranked by merit (stable on ties).
`idealSupply` builds the ideal curve: the **existing fleet** (each source's base-year capacity, flat until its own
`retireYear`; a source with no fleet starts disabled), **early retirement** (fleet of a source with merit < `retireBelow`
ramps linearly to 0 by `retireByYear`; 0 = off; it stays in the ranking, so it is rebuilt only if the channels above it
can't cover), then `autoFill` with `fillPriority` = the ranking of channels with feasibility ≥ `minFeasibility`, then
`topUpEveryYear`. **Start years:** channels with a long lead time have a range `{ earliest, realistic }`
(`defaultStartYears`: fusion 2035/2045, nuclear 2035/2042, geothermal 2035/2040, LNG 2035/2038, hydrogen 2032/2038,
clean fuels and electricity import 2030/2035, fossil-fuel import 2025/2025; others none). The effective year slides
linearly from earliest (normalised feasibility weight 0) to realistic (≥ `FEASIBILITY_WEIGHT_FULL = 0.5`); `autoFill`
and `topUpEveryYear` build nothing new in a channel before it (a zero point at `start − 1` keeps the ramp from leaking
earlier); the existing fleet is not affected. Only the priority tab uses them: the plan tab's auto-adjust and the presets
don't. Editable in the table (earliest / realistic, effective year below; clearing earliest removes the limit;
`priorityStore.startYears`, null = none). Caps are the tool's own (`defaultMaxPower` + edits in `priorityStore.maxPower`, null = none), replacing
the scenario's `maxPower`; without caps the top channel takes everything. Years still short are returned as `shortfall`
(red alert). The page shows the weights, the options, KPIs (emissions, mix merit, mix feasibility, renewable share) vs.
the active scenario, the ideal chart (active supply total as the dashed compare line) and the ranking table. Scores,
feasibility, caps and start years are editable there (persisted in `priorityStore`, Zod-validated; also used by the trilemma and
pyramid tabs through `useScoreOf`; "אפס ציונים, תקרות ושנים" restores the samples). "החל על תרחיש ההיצע הפעיל" writes the
ideal scenario to the active supply slot through `applyAutoFill`, so Undo works. Scores are not saved in scenario files yet.

**Python backend** (`backend/`): the reference engine for the server, batch runs and notebooks. The engine works on
plain dicts in the JSON shape (camelCase); request bodies are validated with the Pydantic models in `schema.py`.
**Parity:** `src/model/goldens.ts` computes, for every demand × policy preset, `computeSeries`, sub-sectors, non-electric
demand, `planSupply`, `fuelRatios`, `autoAdjust` (as is, and on supply ×0.6 / ×1.5), `idealSupply` and `mixMetrics`;
`npm run goldens` writes them, `goldens.test.ts` fails when they are stale, and `test_goldens.py` requires the Python
engine to match within 1e-9. `zod-schema.json` (zod-to-json-schema) is compared field by field with the Pydantic models.
Plan presets live in `src/data/planPresets.json` so both engines read them. JS rounding is kept (`js_round`, `round_up2`).
API: `/api/health`; compute (`/api/series`, `plan-supply`, `auto-adjust`, `apply-plan-rules`, `ideal-supply`);
`/api/scenarios` (CRUD of `energy-dashboard/v2` envelopes; a v1 upload is converted by `migrate.py` and stored as v2); `/api/osemosys/model`, `/api/osemosys/runs` (submit, list,
status with queue position and log tail, `GET …/runs/{id}/log?offset=N` (the log from a byte offset, ANSI codes stripped:
the page follows it live), `GET …/runs/{id}/parameters`, result, `POST …/runs/{id}/cancel`, `PATCH …/runs/{id}` `{name}`
(rename; empty removes it), `DELETE …/runs/{id}` (deletes a finished run's json / result / log / params; 409 while queued or
running), `GET …/runs?limit=` (default 20, max 500)). Each run saves `runs/<id>.params.json` at submit
(`osemosys/params.py`: system, useful demand per year, every technology's costs / life / CF / limits, fuel prices, in the model's
units PJ / GW / $/kW / $/GJ); an older run without one gets it computed from its stored request. State = atomic JSON files under `STATE_DIR` (not SQLite: the
mirror uploads files while the app runs), mirrored to a Google Cloud Storage bucket (`STATE_BUCKET`, no token: the
service authenticates as its own Cloud Run service account): restored on start,
pushed every `SYNC_EVERY` s when changed, right after a run and on shutdown. Deleted files (runs, scenarios) are queued with
`HubSync.mark_deleted` and deleted from the bucket on the next push (`HubClient.delete`), so a restore doesn't bring them back. Runs are child processes (spawn), at most
`MAX_ACTIVE_RUNS`, with `RUN_TIME_LIMIT`; runs cut off by a restart are marked failed on start. `RUN_TOKEN` (header
`X-Run-Token`) guards writes; reads stay open. Settings are env vars (`api/deps.py`). `RUN_IN_REQUEST=1` (set on Cloud
Run, which throttles the CPU between requests) makes `POST /api/osemosys/runs` wait until its run ends and return it
finished; the run is still a child process, so status, log and cancel work, and `OptimizePage` shows the active run from
the run list while the request is open. The client's health check waits up to 25 s with one retry (cold start).

**OSeMOSYS** (`backend/energy_model/osemosys/`): **one dataset.** The model is generated from the dashboard's files only
(no vendored model, no overlay): `build.py` takes the demand and supply scenarios, `catalog.json` and `energySystem.json`.
Years = the demand scenario's base year to its horizon; 6 timeslices (`energySystem.timeslices`, the year split). **Demand:**
each sector / sub-sector is a demand commodity in *useful* energy: its net electricity, fuels and gas (after efficiency /
saving; transport fuels and gas split by `fuelShare`) × the end-use efficiency of its `kind` (`energySystem.endUse`:
transport fuels 0.4 = the dashboard's `electrifyOffset`, heat-pump vs boiler for heat/cooling…), with a demand profile per
kind. End-use technologies `USE_<commodity>_<ELEC|FUEL|GAS>`: in kind `fixed` each carrier's activity is held at the
dashboard's value (no switching); in `heatCool` / `industrialHeat` / `transport` the model picks the mix, from a base-year
fleet (sized by the carrier's base use / capacityFactor) that retires linearly over its operating life, with capex /
fixed cost per W of useful output. **Supply:** each source is one technology (`PWR_<key>`, `H2_<key>` for green / blue
hydrogen, `STO_<key>` for storage, which only adds firm capacity) with its own economics: `capitalCost`, `fixedCost`,
`variableCost`, `operatingLife`, `efficiency` + `inputFuel` (input ratio 1/efficiency), `emissionFactor`, `profile`
(timeslice capacity factors keeping the source's yearly CF; no profile = dispatchable up to
`dispatchableAvailability`), `earliestYear`; the reserve-margin tag is its `capacityCredit`. The base-year fleet is
`residual_capacity` until `retireYear`; no new build in the base year (it is the existing fleet) nor before `earliestYear`;
disabled sources can't be built; `capped` adds `maxPower` as `capacity_gross_max`; `follow` puts the dashboard curve in
`capacity_gross_min` (the base year stays the fleet; a curve that rises before `earliestYear` moves that limit back). **Fuels:** `IMP_<commodity>` imports priced per J (some from an
earliest year); the end-use `Fuels` carrier comes from `BLD_OilProducts` / `BLD_CleanFuel` / `BLD_Hydrogen` with combustion
emissions (equal to `FINAL_EMISSION_FACTOR` in `fuel.ts`; tested). A fuel import may carry `activityAnnualMax` (J/y): free
`Waste` is capped at ~60 PJ/y. A source whose `inputFuel` is `Electricity` (green hydrogen) gets no emission ratio in the
model (its electricity is counted at generation). System: discount rate, reserve margin (firm capacity ≥ highest timeslice
electricity production × factor; 1.45 = the ~1.25 peak-to-timeslice ratio × a 15% reserve, since the slices are averages),
emission penalty. `test_osemosys.py` checks the sample economics stay within public ranges (ATB / IRENA / Lazard / IPCC). **Units at the solver boundary only:** the LP gets PJ,
GW and $M (`capacity_activity_unit_ratio` = 31.536 on every technology; capex ×1e3, variable ×1e9, emissions kg/J ×1e6 →
Mt/PJ); `solve.py` converts back: capacity W, electricity / hydrogen / fuel-import J per source, the end-use mix (J per
commodity and carrier), CO₂ kg, discounted cost $. `export.py` writes the generated model in osemosys_israel's layout; the
exported YAML loads with `Model.from_yaml` and solves to the same objective (test). Every preset pair solves in all three
modes (test).
The **optimisation tab** (`OptimizePage`): run mode (free / capped / follow), run, poll every 3 s (queue position, running time), cancel, history;
under the status two `Disclosure` sections (rotating-triangle handles): **פלט הפותר** (`RunLog`: open while the run is active, reads
only the new log bytes every second, a `\r`-rewritten progress line shows its last state, auto-scrolls unless scrolled up; the child
process is line-buffered and `solve.run` prints stage lines, since building the model is otherwise silent) and **פרמטרי ההרצה**
(`RunParametersPanel`: loaded when opened; system / demand / technologies (filtered by group) / fuels tables, CSV); four charts in
a 2×2 grid, top right to bottom left: **final energy by carrier** (the model's end-use choice, in the total-energy unit with
its axis menu; compare line: the dashboard's final energy), **electricity generation** by source (TWh), **installed capacity**
(GW) and **CO₂ emissions** by source (`RunResult.emissionsBySource` from `solve.py`, technologies outside the catalogue in one
`_finalUse` band; older runs draw their total; compare line: the active scenario's emissions from `usePlanSupply`, as the
scenario-planning tab counts them); KPIs: discounted cost,
CO₂ and renewable share at the target year and the horizon. **ניהול הרצות** (`RunsManager`, a modal next to the history
menu): rename runs (saved on blur / Enter; the history menu shows the name first), delete one or tick several and delete them
(confirmed in the same modal; active runs can't be deleted); if the run on display is deleted the newest one is shown. The ⚙ modal gets a **שמירה בשרת** card (save / pick / open /
delete, token field) and auto-adjust runs on the server when it is up (else in the browser: same result).

## Conventions

- **PRs:** when the user asks to open a PR and/or merge it into `main`, just do it: no plan-approval step or
  confirmation is needed for creating a PR or merging it into `main`. Never write a plan or ask "should I proceed?"
  for this; even in plan mode, exit it at once with a one-line plan and go straight to creating / merging the PR
  (still wait for green CI before merging).
- **Two engines, one result.** A change to a calculation in `src/model/` is made in `backend/energy_model/` too, then
  `npm run goldens` and `npm run test:py`. A schema change: Zod, `npm run schema`, then `schema.py`. Python code: ruff
  (line length 120), English docstrings like the TS code (see **Code comments are in English** below).
- **SI everywhere.** Stored data, schemas and both engines use J, W, kg, m³, $ and fractions; convert only for display
  (`model/units.ts` / `energy_model/units.py`). Sliders keep display-unit ranges and write SI. A new economic or physical
  field goes in SI with its unit in the Zod `.describe` / JSDoc. OSeMOSYS data lives in `src/data` (scenarios +
  `energySystem.json`), never in the backend.
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
- **Detail level** (`uiStore.detail`, default `medium`, persisted; control titled "פירוט" next to TWh/GW, plan and scenario-planning tabs, showing
  three dots — large / medium / small — with hidden text names and tooltips): `high` shows
  everything; `medium` hides the side values (TWh/GW, vs-base note) and the panel hints, leaving clean sliders
  on the same line as their label (stacked only in very narrow cells);
  `low` removes the sliders and gears, leaving legend rows (supply rows keep their enable checkbox).
  `CenteredSlider` reads it from the store itself.
- `CenteredSlider` rows respond to their cell width (CSS container query), not the screen: below 28rem the
  name goes above the axis. In the parameter panels the top-level rows are full width and an expanded group's items go in
  two columns (`GroupCell`).
- Save / open / duplicate / compare / reset, and the **target year** selector, live in a modal opened by the ⚙
  button at the far left of the top bar (both tabs); the action runs in the same click so file pickers still work.
- **Demand sectors** (every preset, the order of `catalog.json`): residential, commercial, industry, heat/cooling residential,
  heat/cooling commercial, industrial heat, transport, AI/data centres, water, agriculture, Palestinian Authority (`pa`).
  The three heat sectors were split out of residential / commercial / industry with the catalogue's `split` shares (electricity,
  fuels, gas) and the parent's growth, curve and load factor, so the totals didn't change; `upgradeDemand` does the same split
  for an old scenario that lacks them. Transport has five `subSectors` (private, public, freight, agricultural vehicles, heavy
  equipment: `elecShare` / `fuelShare` of the sector's base, optional own `growthRate`, edited behind the transport gear); the
  sector's electricity is their sum (`sectorTotalTWh`, `projectSubSectors` in `model/demand.ts`). Expanding the transport group
  (`sector:transport`) splits its layer into the sub-sectors (fuels stay one layer); old `transportExpanded` state migrates to it. Measures: low 10%/10%, medium 7%/7%, high 3%/3% (efficiency/saving). `upgradeDemand` runs on
  persisted state and `setScenario`: adds missing baseline sectors (baseline order) and gives a scenario without
  a `measures` field the baseline's (explicit values are kept).
- **Supply sources** (every preset, the order of `catalog.json`): gas, LNG import, gas with CCS, coal, solar, rooftop solar
  (addition), solar 30% / 40%, CSP, wind, deep geothermal, battery storage, pumped hydro, nuclear, fusion, electricity import,
  fossil-fuel import, clean-fuel import, hydrogen import, hydrogen power plants, green hydrogen, blue hydrogen, waste-to-energy,
  other. Together with the sectors they are the **union** of the dashboard's and the OSeMOSYS model's options (`catalog.json`;
  `catalog.test.ts` checks every preset matches it and every item has a colour, sample trilemma scores, a cap and Gantt tasks).
  The newer ones start disabled (except in `tested`, which enables geothermal, the clean imports, gas CCS, rooftop solar,
  pumped hydro and green hydrogen).
  `upgradeSupply` runs on persisted state and on `setScenario` (open/duplicate): it renames the legacy `import`
  source to `importElectricity` (keeping its values) and adds missing baseline sources, in baseline order.
- Sector and source colours are fixed in `components/charts/palette.ts`; add new keys there.
- **Shared helpers before new ones:** number/text formatting in `utils/format.ts`, small math in `model/math.ts`, ECharts
  theme and text measurement in `charts/echartsCore.ts`. UI strings that quote a model constant take it as a parameter
  (e.g. `autofill.explain(AUTOFILL_STEP_YEARS, FIRM_CREDIT_MIN)`), so the text follows the code.
- Code style: single quotes, 2-space indent, lines up to ~120 characters (there is no Prettier config, so don't run
  Prettier with its defaults). Exported functions, components and types get a short JSDoc comment.
- **Code comments are in English** (JSDoc and inline), both TS and Python, even though the UI is Hebrew/RTL and all
  user-visible strings live in `src/i18n/he.ts` in Hebrew. When touching a file whose existing comments are still in
  Hebrew, translate the ones you touch to English rather than adding new English comments next to old Hebrew ones.
- **Refresh the Artifact after visible changes.** After any change with a visible effect (UI, charts, texts, styles),
  rebuild (`npm run build`) and republish the claude.ai Artifact (see **Where to view it**) in the same task, without
  being asked.
- Baseline data is **sample data**: the UI labels it as such. It lives in `src/data/` (bundled
  and validated at import) rather than `public/data/` as the design doc first proposed.

## Where to view it

- **Google Cloud Run** (the full app with the server; set up once with `deploy/cloud-run/SETUP.md`, then deployed by
  `deploy-cloud-run.yml`): the service URL is in the deploy run's summary. Scales to zero; cold start about 10–20 s.
- **GitHub Pages** (once Pages is enabled with Source = GitHub Actions; deploys from the default branch):
  https://shahardo.github.io/EnergyFollowupDashboard/
- **claude.ai Artifact** (private): built from `dist/`. The page is a copy of `dist/index.html`
  without the document skeleton, with `dist/assets/*` published alongside. Republish after each
  change with a visible effect (see the **Refresh the Artifact** convention). Always publish **every** file in `dist/assets/` and remove the old names: the vendor chunks
  (`mantine-*`, `echarts-*`) and the CSS can get new hashes too, and a missing chunk leaves a blank page.

## Saved files

Envelope: `{ schema: 'energy-dashboard/v2', kind: 'demand' | 'supply' | 'projects', savedAt, data }`, in SI units.
`data.preset` (optional) says which preset slot a demand / supply file belongs to; supply files may also carry
`demandPreset` (the demand preset they were fitted to).
Extensions: `*.demand.json`, `*.supply.json`, `*.projects.json`. Opening a file (button or drag-and-drop anywhere
in the window) detects its `kind` and loads it into the matching store.

**v1 files still open:** `scenarioFiles.ts` validates a `energy-dashboard/v1` file with the old schemas
(`src/schema/v1.ts`) and converts it with `src/io/migrateV1.ts` (TWh → J, GW → W, MW → W, % → fractions, field renames;
sources get their economics from the matching preset through `upgradeSupply`); persisted v1 state is migrated the same way
(persist versions: demand 4, supply 5, projects 5, priority 2). The server does the same (`energy_model/migrate.py`).

Field names say what they are (v1 → v2): sector `baseTWh` → `baseEnergy` (J), `growthPct` / `efficiencyPct` →
`growthRate` / `efficiencyRate`, `nonElectric { fuels, gas, growthRate }`, measures `{ efficiency, saving }` (0..0.4),
source `capacityGW [{year, gw}]` → `capacity [{year, power}]` (W), `maxGW` → `maxPower`, planParams `slope / rate / step / base`
(W) and `share`, project `mw` → `power` (W), `progressPct` → `progress`, trilemma `feasibilityPct` → `feasibility`.
Supply sources may carry economics (all optional): `capitalCost` ($/W), `fixedCost` ($/W/yr), `variableCost` ($/J),
`operatingLife` (yr), `efficiency`, `inputFuel`, `emissionFactor` (kg CO₂eq/J), `earliestYear`, `profile`.
`fuel.ts` reads `efficiency` / `emissionFactor` / `inputFuel` from the source (tables only as fallback).

Deviations from the design doc: `SupplySource` has a `renewable: boolean` field, which `computeGap` uses for the renewable
share, and an optional `maxPower` (auto-fill cap). Projects files hold `{ id, name, asOf, projects }`: one `asOf` for the
whole list instead of one per project. Each item is a task in the Gantt row of its `channel` (source); `power` is optional.

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

**Feasibility pyramid: done.** A fourth tab (later merged into the trilemma tab as its 3D view) with a 3D pyramid per channel: trilemma triangle as base,
feasibility as height, a ticked height axis, solid colours. Drag in any card (or arrow keys) rotates all the pyramids
together about the feasibility axis (left/right) and tilts the axis toward the viewer (up/down).

**Channel priority tab: done.** Weights (emissions / price / security / feasibility) rank the 14 channels; an ideal
supply curve is built from the existing fleet by the ranking, with a feasibility threshold for new build, early
retirement of low-merit fleet, editable scores / feasibility / caps, KPIs vs. the active scenario, and "apply" (with undo).
Per-channel start years (earliest / realistic, slid by the feasibility weight) keep long-lead channels out until then.

**Scenario planning tab: done.** Tab renamed to "תרחישי ביקוש ואספקה"; non-electric demand (fuels, direct gas) per sector;
transport split into electricity / fuels in שעט"ן; new "תכנון תרחישים" tab with a sectors / energy-carriers view and a
rule-based supply (solar slopes, import steps, geothermal / fusion ramps, gas and fossil fuels as the remainder).

Follow-up: policy menu on the new tab's supply chart (shared with the plan tab), slower geothermal, distinct fusion colour,
supply curtailed so it never goes above the demand lines.

Linked tabs: one supply for both (rules in `SupplyScenario.planParams`, presets rebuilt from the rules); the demand chart
shows final energy, independent of supply.

Demand and supply charts share the same Y-axis top on the two planning tabs.

**Python backend and OSeMOSYS: done.** The union of the dashboard's and the OSeMOSYS Israel model's sectors and
sources (shared catalogue, heat sectors, transport sub-sectors, 8 new sources; fusion, geothermal, data centres, PA…
added to the model as an overlay); the Python engine with golden parity; FastAPI with saved scenarios and background
OSeMOSYS runs; the optimisation tab; Docker image and Hugging Face Space deployment with a dataset mirror for state. Hosting moved to
Google Cloud Run (free tier; solves run inside the request) when Hugging Face made Docker Spaces paid; the state mirror
moved too, from a private HF dataset to a Google Cloud Storage bucket (no secret needed: the service authenticates as
its own Cloud Run service account).
Not done: OpenAPI-generated TS types (the client's types are hand-written), the priority tab's "apply" on the server
(it already has the ideal curve in the browser), green / blue hydrogen in the scenario-planning fuel mix, logins.

**One dataset in SI: done.** Schema v2 (J, W, kg, m³, $, fractions; v1 files and state migrated), economics on every supply
source, both engines in SI (goldens kept), and the OSeMOSYS model generated from the dashboard's files alone
(`energySystem.json` holds the end-use chain, fuel imports and system parameters; the vendored osemosys_israel copy and the
overlay are gone), with an export in osemosys_israel's layout and the end-use carrier mix on the optimisation tab.

**Optimisation tab follow-up: done.** Live solver output (offset-based log endpoint, 1 s polling), rotating-triangle
handles for the output and a new run-parameters panel (parameters saved with every run); the trilemma and pyramid tabs merged
into one with a 2D/3D toggle.

**Chart view selector and table export: done.** Every demand/supply chart's title shrank to "ביקוש לפי:" / "אספקה לפי:"
followed by a view `Select` (`ViewSelect.tsx`) in place of the old fixed title suffix and the scenario-planning tab's
top-bar "תצוגה" toggle (removed): demand switches between מגזר and מקור אנרגיה, supply between ערוץ אספקה and the new
אנרגיה סופית (collapses the per-source stack to the same electricity/fuels/gas carrier colours as demand's carrier view,
computed on the fly — not a stored series), both persisted in `uiStore` and shared by every tab. Every `ChartCard` gained
a **טבלה** button (parses the chart's own CSV text into a table modal). Default units changed to `toe` (אנרגיה/שעט"ן) and
default detail to `medium`.

**Energy-unit menu, optimisation charts, run management: done.** The total-energy charts' Y-axis name became a menu
(מיליון שעט"ן / PJ / TWh, shared); the optimisation tab shows final energy, generation, capacity and emissions (new, by
source) in a 2×2 grid; OSeMOSYS runs can be renamed and deleted (also from the bucket mirror).

**Two detail levels: done.** Demand main sectors / carriers and supply categories / carriers, each expandable with a
triangle handle into its items, in the parameter panels (aggregate group sliders) and the charts (shades of the group's
colour), on the plan, scenario-planning, priority and optimisation tabs, with one shared expand state.

**Not yet built:**
- Phase 4: hourly profile, sensitivity analysis.
- Playwright e2e tests (the save → open → same results flow was verified manually).

Known quirk: in this container's headless Chromium, a Hebrew download filename falls back to
`download`. English names keep their name; not yet checked in a regular browser.

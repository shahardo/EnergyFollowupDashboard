/**
 * המרה מפורמט v1 (TWh / GW / MW / אחוזים) לפורמט v2 (SI: J / W / שברים), לקבצים שמורים ולמצב שנשמר
 * בדפדפן. הנתונים הכלכליים החדשים של המקורות לא קיימים ב-v1; upgradeSupply משלים אותם מהתרחיש המוכן.
 * אותה המרה ב-Python: backend/energy_model/migrate.py.
 */
import type { DemandScenario, ProjectsData, ScenarioPlanParams, SupplyScenario, TrilemmaScore } from '../schema';
import type {
  DemandScenarioV1,
  ProjectsDataV1,
  ScenarioPlanParamsV1,
  SupplyScenarioV1,
  TrilemmaScoreV1,
} from '../schema/v1';
import { fromGW, fromMW, fromPct, fromTWh } from '../model/units';

/** מוחק שדות undefined, כדי שהתוצאה תהיה כמו JSON שנקרא מקובץ. */
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** תרחיש ביקוש v1 → v2. */
export function migrateDemandV1(d: DemandScenarioV1): DemandScenario {
  return clean({
    id: d.id,
    name: d.name,
    preset: d.preset,
    baseYear: d.baseYear,
    horizonYear: d.horizonYear,
    measures: d.measures && { efficiency: fromPct(d.measures.efficiencyPct), saving: fromPct(d.measures.savingPct) },
    sectors: d.sectors.map((s) =>
      clean({
        key: s.key,
        label: s.label,
        baseEnergy: fromTWh(s.baseTWh),
        growthRate: fromPct(s.growthPct),
        curve: s.curve,
        sMidYear: s.sMidYear,
        efficiencyRate: fromPct(s.efficiencyPct),
        loadFactor: s.loadFactor,
        nonElectric:
          s.nonElectric &&
          clean({
            fuels: fromTWh(s.nonElectric.fuelsTWh),
            gas: fromTWh(s.nonElectric.gasTWh),
            growthRate: fromPct(s.nonElectric.growthPct),
            electrifyOffset: s.nonElectric.electrifyOffset,
          }),
        subSectors: s.subSectors?.map((x) =>
          clean({
            key: x.key,
            label: x.label,
            elecShare: x.elecShare,
            fuelShare: x.fuelShare,
            growthRate: x.growthPct === undefined ? undefined : fromPct(x.growthPct),
          }),
        ),
      }),
    ),
  });
}

/** כללי תכנון התרחישים v1 → v2. */
export function migratePlanParamsV1(p: ScenarioPlanParamsV1): ScenarioPlanParams {
  return {
    solar: { base: fromGW(p.solar.baseGW), slope: fromGW(p.solar.slopeGW) },
    solar30: { start: p.solar30.start, slope: fromGW(p.solar30.slopeGW) },
    solar40: { start: p.solar40.start, slope: fromGW(p.solar40.slopeGW) },
    importElectricity: {
      start: p.importElectricity.start,
      step: fromGW(p.importElectricity.stepGW),
      stepYears: p.importElectricity.stepYears,
      steps: p.importElectricity.steps,
    },
    geothermal: { start: p.geothermal.start, rate: fromGW(p.geothermal.rateGW), rampYears: p.geothermal.rampYears },
    fusion: { start: p.fusion.start, rate: fromGW(p.fusion.rateGW), rampYears: p.fusion.rampYears },
    cleanFuels: { start: p.cleanFuels.start, share: fromPct(p.cleanFuels.sharePct) },
    hydrogen: { start: p.hydrogen.start, share: fromPct(p.hydrogen.sharePct) },
  };
}

/** תרחיש היצע v1 → v2 (בלי הנתונים הכלכליים: upgradeSupply משלים אותם). */
export function migrateSupplyV1(s: SupplyScenarioV1): SupplyScenario {
  return clean({
    id: s.id,
    name: s.name,
    preset: s.preset,
    demandPreset: s.demandPreset,
    demandScenarioRef: s.demandScenarioRef,
    fillPriority: s.fillPriority,
    planParams: s.planParams && migratePlanParamsV1(s.planParams),
    sources: s.sources.map((x) =>
      clean({
        key: x.key,
        label: x.label,
        enabled: x.enabled,
        renewable: x.renewable,
        capacity: x.capacityGW.map((c) => ({ year: c.year, power: fromGW(c.gw) })),
        capacityFactor: x.capacityFactor,
        capacityCredit: x.capacityCredit,
        retireYear: x.retireYear,
        maxPower: x.maxGW === undefined ? undefined : fromGW(x.maxGW),
      }),
    ),
  });
}

/** רשימת משימות v1 → v2. */
export function migrateProjectsV1(p: ProjectsDataV1): ProjectsData {
  return {
    ...p,
    projects: p.projects.map(({ mw, progressPct, ...rest }) =>
      clean({ ...rest, power: mw === undefined ? undefined : fromMW(mw), progress: fromPct(progressPct) }),
    ),
  };
}

/** ציוני טרילמה v1 → v2. */
export function migrateScoreV1({ feasibilityPct, ...rest }: TrilemmaScoreV1): TrilemmaScore {
  return { ...rest, feasibility: fromPct(feasibilityPct) };
}

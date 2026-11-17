/**
 * תוצאות הייחוס של המנוע לצירוף אחד של תרחיש ביקוש ומדיניות היצע: הקלט והפלט של כל פונקציה מרכזית.
 * מנוע ה-Python משחזר אותן (backend/tests/test_goldens.py). לא בשימוש בממשק.
 */
import { demandPresets, supplyPresets } from '../data/baseline';
import { planParamsOf } from '../data/scenarioPlan';
import { defaultMaxGW, defaultStartYears, defaultWeights, scoreFor, trilemmaScores } from '../data/trilemma';
import type { DemandPreset, SupplyPreset, SupplyScenario } from '../schema';
import { autoAdjust } from './autofill';
import { measureNonElectric, projectNonElectric } from './carriers';
import { projectSubSectors } from './demand';
import { fuelRatios } from './fuel';
import { idealSupply, mixMetrics } from './priority';
import { planSupply } from './scenarioPlan';
import { computeDemandSeries, computeSeries } from './series';

/** התיקייה של קובצי הייחוס. */
export const GOLDEN_DIR = 'backend/tests/goldens';

/** הגדרות כלי התעדוף בקובצי הייחוס (ברירות המחדל של priorityStore). */
const PRIORITY = { minFeasibilityPct: 20, retireBelow: 5, retireByYear: 2040 };

/** תרחיש היצע שכל נקודות ההספק שלו מוכפלות ב-k. */
const scaled = (s: SupplyScenario, k: number): SupplyScenario => ({
  ...s,
  sources: s.sources.map((x) => ({ ...x, capacityGW: x.capacityGW.map((c) => ({ year: c.year, gw: c.gw * k })) })),
});

/** הקלט והפלט של צירוף אחד. */
export function goldenFor(d: DemandPreset, p: SupplyPreset) {
  const demand = demandPresets[d];
  const supply = supplyPresets[d][p];
  const ds = computeDemandSeries(demand);
  const series = computeSeries(ds, supply);
  const ne = projectNonElectric(demand, ds.demandPoints);
  const m = measureNonElectric(demand, ne, ds.years);
  const fuels = ds.years.map((year, i) => ({ year, fuelsTWh: m.fuels[i].netTWh, gasTWh: m.gas[i].netTWh }));
  const plan = planSupply(supply, planParamsOf(supply), ds.years, ds.totals, fuels, demand.horizonYear);
  const scores = Object.fromEntries(supply.sources.map((s) => [s.key, scoreFor(s.key)]));
  const opts = { weights: defaultWeights, ...PRIORITY, maxGW: defaultMaxGW, startYears: defaultStartYears };
  const ideal = idealSupply(ds.totals, supply, scoreFor, opts);
  return {
    input: { demand, supply, scores: { ...scores, other: trilemmaScores.other }, priority: opts },
    series,
    subSectors: projectSubSectors(demand),
    nonElectric: ne,
    nonElectricMeasured: m,
    plan,
    fuelRatios: fuelRatios(series.supplyPoints, ds.years),
    autoAdjust: autoAdjust(ds.totals, supply),
    // התאמה לא טריוויאלית: היצע מוקטן (השלמה) ומוגדל (הקטנה יחסית).
    autoAdjustDeficit: autoAdjust(ds.totals, scaled(supply, 0.6)),
    autoAdjustSurplus: autoAdjust(ds.totals, scaled(supply, 1.5)),
    ideal,
    mix: mixMetrics(computeSeries(ds, ideal.scenario).supplyPoints, scoreFor),
  };
}

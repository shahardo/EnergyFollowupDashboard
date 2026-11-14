import { describe, expect, it } from 'vitest';
import { baselineSupply, demandPresets } from '../data/baseline';
import { defaultPlanParams as p } from '../data/scenarioPlan';
import type { SupplyScenario } from '../schema';
import {
  applyPlanRule,
  planCapacity,
  planCurve,
  planSupply,
  rampCapacity,
  refillGas,
  ruleMatches,
} from './scenarioPlan';
import { computeDemandSeries } from './series';
import { computeSupply, interpolateCapacity } from './supply';

describe('planCapacity', () => {
  it('adds 1 GW of solar a year from the base', () => {
    expect(planCapacity('solar', p, 2035, 2025) - planCapacity('solar', p, 2025, 2025)).toBeCloseTo(10);
  });
  it('starts solar 30% / 40% in their start years at 0.5 GW a year', () => {
    expect(planCapacity('solar30', p, 2029, 2025)).toBe(0);
    expect(planCapacity('solar30', p, 2030, 2025)).toBe(0.5);
    expect(planCapacity('solar40', p, 2034, 2025)).toBe(0);
    expect(planCapacity('solar40', p, 2044, 2025)).toBe(5);
  });
  it('steps electricity import 1 / 2 / 3 / 4 GW in 2030 / 35 / 40 / 45', () => {
    expect([2029, 2030, 2035, 2040, 2045, 2050].map((y) => planCapacity('importElectricity', p, y, 2025))).toEqual([
      0, 1, 2, 3, 4, 4,
    ]);
  });
  it('ramps geothermal and fusion in, then builds at a steady rate', () => {
    expect(planCapacity('geothermal', p, 2034, 2025)).toBe(0);
    expect(planCapacity('fusion', p, 2039, 2025)).toBe(0);
    const g = (y: number) => rampCapacity(p.geothermal, y);
    const end = p.geothermal.start + p.geothermal.rampYears;
    expect(g(2035) - g(2034)).toBeLessThan(p.geothermal.rateGW);
    expect(g(end) - g(end - 1)).toBeCloseTo(p.geothermal.rateGW);
  });
  it('planCurve has one point a year', () => {
    const c = planCurve('solar', p, 2025, 2050);
    expect(c).toHaveLength(26);
    expect(c[25].gw).toBeCloseTo(p.solar.baseGW + 25, 2);
  });
});

const demand = computeDemandSeries(demandPresets.medium);
const totals = demand.totals;
const years = demand.years;
const base: SupplyScenario = { ...baselineSupply, planParams: p };
const sum = (s: SupplyScenario, y: number, f: 'twh' | 'firmGW') =>
  computeSupply(s, [y]).reduce((a, x) => a + x[f], 0);

describe('rules on the supply scenario', () => {
  it('refillGas meets energy and peak every year', () => {
    const s = refillGas(base, totals);
    for (const t of totals) {
      expect(sum(s, t.year, 'twh')).toBeGreaterThanOrEqual(t.twh - 1e-6);
      expect(sum(s, t.year, 'firmGW')).toBeGreaterThanOrEqual(t.peakGW - 1e-6);
    }
  });
  it('applyPlanRule rewrites only that source (and gas), keeping other edits', () => {
    const edited: SupplyScenario = {
      ...base,
      sources: base.sources.map((s) =>
        s.key === 'wind' || s.key === 'solar' ? { ...s, capacityGW: [{ year: 2025, gw: 4 }] } : s,
      ),
      planParams: { ...p, geothermal: { ...p.geothermal, rateGW: 1 } },
    };
    const s = applyPlanRule(edited, 'geothermal', totals);
    const geo = s.sources.find((x) => x.key === 'geothermal')!;
    expect(geo.enabled).toBe(true);
    expect(interpolateCapacity(geo.capacityGW, 2050)).toBeCloseTo(rampCapacity({ ...p.geothermal, rateGW: 1 }, 2050), 1);
    expect(s.sources.find((x) => x.key === 'wind')!.capacityGW).toEqual([{ year: 2025, gw: 4 }]);
    expect(ruleMatches(base, 'solar', 2025, 2050)).toBe(true);
    expect(s.sources.find((x) => x.key === 'solar')).toEqual(edited.sources.find((x) => x.key === 'solar'));
    expect(ruleMatches(s, 'geothermal', 2025, 2050)).toBe(true);
    expect(ruleMatches(s, 'solar', 2025, 2050)).toBe(false);
  });
});

describe('planSupply (display)', () => {
  const fuels = years.map((year) => ({ year, fuelsTWh: 100, gasTWh: 20 }));
  it('stacks rule sources first and gas last, and never goes above demand', () => {
    const big = applyPlanRule({ ...base, planParams: { ...p, solar: { ...p.solar, slopeGW: 6 } } }, 'solar', totals);
    const r = planSupply(big, big.planParams!, years, totals, fuels, 2050);
    expect(r.electricKeys[0]).toBe('solar');
    expect(r.electricKeys.at(-1)).toBe('gas');
    for (const t of totals) {
      const pts = r.electric.filter((x) => x.year === t.year);
      expect(pts.reduce((a, x) => a + x.twh, 0)).toBeLessThanOrEqual(t.twh + 1e-6);
      expect(pts.reduce((a, x) => a + x.firmGW, 0)).toBeLessThanOrEqual(t.peakGW + 1e-6);
    }
  });
  it('splits fuels by the mix and supplies direct gas', () => {
    const r = planSupply(base, p, years, totals, fuels, 2050);
    const y = r.fuels.filter((x) => x.year === 2050);
    expect(y.find((x) => x.source === 'importClean')!.twh).toBeCloseTo(20);
    expect(y.find((x) => x.source === 'gasDirect')!.twh).toBe(20);
  });
});

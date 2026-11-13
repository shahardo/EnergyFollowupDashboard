import { describe, expect, it } from 'vitest';
import { defaultPlanParams as p, planSourceMeta } from '../data/scenarioPlan';
import { planCapacity, planSupply, rampCapacity } from './scenarioPlan';
import { yearRange } from './years';

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
    expect(g(2035) - g(2034)).toBeLessThan(0.5);
    expect(g(2045) - g(2044)).toBeCloseTo(0.5);
    expect(g(2050) - g(2049)).toBeCloseTo(0.5);
  });
});

describe('planSupply', () => {
  const years = yearRange(2025, 2050);
  const electric = years.map((year, i) => ({ year, twh: 80 + 3 * i, peakGW: 16 + 0.6 * i }));
  const fuels = years.map((year) => ({ year, fuelsTWh: 100, gasTWh: 20 }));
  const s = planSupply(p, planSourceMeta, years, electric, fuels, 2025, 2050);
  it('fills the rest of electricity with gas: energy and peak are met every year', () => {
    for (const d of electric) {
      const pts = s.electric.filter((x) => x.year === d.year);
      expect(pts.reduce((a, x) => a + x.twh, 0)).toBeGreaterThanOrEqual(d.twh - 1e-9);
      expect(pts.reduce((a, x) => a + x.firmGW, 0)).toBeGreaterThanOrEqual(d.peakGW - 1e-9);
    }
  });
  it('splits fuels by the mix and supplies direct gas', () => {
    const y = s.fuels.filter((x) => x.year === 2050);
    expect(y.filter((x) => x.source !== 'gasDirect').reduce((a, x) => a + x.twh, 0)).toBeCloseTo(100);
    expect(y.find((x) => x.source === 'importClean')!.twh).toBeCloseTo(20);
    expect(y.find((x) => x.source === 'gasDirect')!.twh).toBe(20);
  });
});

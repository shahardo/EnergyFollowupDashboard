import { describe, expect, it } from 'vitest';
import { demandPresets } from '../data/baseline';
import { defaultPlanParams } from '../data/scenarioPlan';
import { fuelShares, measureNonElectric, projectNonElectric } from './carriers';
import { projectDemand } from './demand';
import { yearRange } from './years';

describe('projectNonElectric', () => {
  const d = demandPresets.high;
  const pts = projectNonElectric(d, projectDemand(d));
  it('starts at the base values', () => {
    const t0 = pts.find((p) => p.sector === 'transport' && p.year === d.baseYear)!;
    expect(t0.fuelsTWh).toBe(d.sectors.find((s) => s.key === 'transport')!.nonElectric!.fuelsTWh);
  });
  it('lets electrification displace transport fuels, never below zero', () => {
    const t = pts.filter((p) => p.sector === 'transport');
    expect(t.every((p) => p.fuelsTWh >= 0)).toBe(true);
    expect(t[t.length - 1].fuelsTWh).toBeLessThan(t[0].fuelsTWh);
  });
  it('grows direct gas with its growth rate', () => {
    const ind = pts.filter((p) => p.sector === 'industry');
    expect(ind[ind.length - 1].gasTWh).toBeGreaterThan(ind[0].gasTWh);
  });
});

describe('measureNonElectric', () => {
  it('applies the scenario measures to the non-electric totals', () => {
    const d = demandPresets.medium;
    const years = yearRange(d.baseYear, d.horizonYear);
    const m = measureNonElectric(d, projectNonElectric(d, projectDemand(d)), years);
    const last = m.fuels[m.fuels.length - 1];
    expect(last.netTWh).toBeCloseTo(last.grossTWh * 0.93 * 0.93, 6);
    expect(m.fuels[0].netTWh).toBe(m.fuels[0].grossTWh);
  });
});

describe('fuelShares', () => {
  it('ramps clean fuels and hydrogen from their start years, fossil fills the rest', () => {
    expect(fuelShares(2029, defaultPlanParams, 2050)).toEqual({ importClean: 0, hydrogenImport: 0, importFossil: 1 });
    const s = fuelShares(2050, defaultPlanParams, 2050);
    expect(s.importClean).toBeCloseTo(0.2);
    expect(s.hydrogenImport).toBeCloseTo(0.1);
    expect(s.importClean + s.hydrogenImport + s.importFossil).toBeCloseTo(1);
    expect(fuelShares(2039, defaultPlanParams, 2050).hydrogenImport).toBe(0);
  });
  it('scales clean + hydrogen down when they exceed 100%', () => {
    const p = { ...defaultPlanParams, cleanFuels: { start: 2025, sharePct: 80 }, hydrogen: { start: 2025, sharePct: 80 } };
    const s = fuelShares(2050, p, 2050);
    expect(s.importClean + s.hydrogenImport).toBeCloseTo(1);
    expect(s.importFossil).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { baselineDemand, baselineSupply } from '../data/baseline';
import type { SupplyScenario, SupplySource } from '../schema';
import { autoAdjust, autoFill, autoFillYears } from './autofill';
import { demandTotals, projectDemand } from './demand';
import { computeGap } from './gap';
import { computeSupply } from './supply';
import { yearRange } from './years';

const src = (key: string, patch: Partial<SupplySource> = {}): SupplySource => ({
  key, label: key, enabled: true, renewable: false,
  capacityGW: [{ year: 2025, gw: 0 }], capacityFactor: 0.5, capacityCredit: 0.5, ...patch,
});

const demand = [2025, 2026, 2027, 2028, 2029, 2030].map((year, i) => ({ year, twh: 44 + i * 4.38, peakGW: 5 + i }));

const gapAt = (s: SupplyScenario, year: number) =>
  computeGap(demand, computeSupply(s, demand.map((d) => d.year)), s).find((g) => g.year === year)!;

describe('autoFillYears', () => {
  it('steps by 5 and always includes the horizon', () => {
    expect(autoFillYears(yearRange(2025, 2037))).toEqual([2025, 2030, 2035, 2037]);
  });
});

describe('autoFill', () => {
  it('closes the energy and peak gap at the anchor years', () => {
    const s: SupplyScenario = { id: 'x', name: 'x', sources: [src('a'), src('b')], fillPriority: ['a', 'b'] };
    const { scenario } = autoFill(demand, s);
    for (const y of [2025, 2030]) {
      expect(gapAt(scenario, y).gapTWh).toBeLessThan(1e-6);
      expect(gapAt(scenario, y).peakGapGW).toBeLessThan(1e-6);
    }
  });
  it('fills in priority order, so the first source takes everything when uncapped', () => {
    const s: SupplyScenario = { id: 'x', name: 'x', sources: [src('a'), src('b')], fillPriority: ['b', 'a'] };
    const { addedGW } = autoFill(demand, s);
    expect(addedGW.b).toBeGreaterThan(0);
    expect(addedGW.a).toBeUndefined();
  });
  it('respects maxGW and moves on to the next source', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x', sources: [src('a', { maxGW: 3 }), src('b')], fillPriority: ['a', 'b'],
    };
    const { scenario, addedGW } = autoFill(demand, s);
    expect(addedGW.a).toBeCloseTo(3);
    expect(addedGW.b).toBeGreaterThan(0);
    expect(gapAt(scenario, 2030).gapTWh).toBeLessThan(1e-6);
  });
  it('never lowers built capacity between anchors', () => {
    const shrinking = demand.map((d, i) => ({ ...d, twh: 100 - i * 10, peakGW: 1 }));
    const s: SupplyScenario = { id: 'x', name: 'x', sources: [src('a')], fillPriority: ['a'] };
    const a = autoFill(shrinking, s).scenario.sources[0].capacityGW;
    for (let i = 1; i < a.length; i++) expect(a[i].gw).toBeGreaterThanOrEqual(a[i - 1].gw);
  });
  it('skips retired sources and enables disabled ones it uses', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x',
      sources: [src('old', { retireYear: 2020 }), src('new', { enabled: false, capacityGW: [{ year: 2025, gw: 50 }] })],
      fillPriority: ['old', 'new'],
    };
    const { scenario, addedGW } = autoFill(demand, s);
    expect(addedGW.old).toBeUndefined();
    const n = scenario.sources[1];
    expect(n.enabled).toBe(true);
    // A disabled source's old anchors are not revived: only the added capacity counts.
    expect(n.capacityGW[0].gw).toBeCloseTo(44 / (0.5 * 8.76), 1);
  });
  it('covers the peak from firm sources before low-credit ones', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x',
      sources: [src('solar', { capacityFactor: 0.2, capacityCredit: 0.05 }), src('battery', { capacityFactor: 0, capacityCredit: 0.8 })],
      fillPriority: ['solar', 'battery'],
    };
    const { scenario, addedGW } = autoFill(demand, s);
    // Solar covers the energy; the battery covers the peak that solar's small credit leaves.
    expect(addedGW.battery).toBeGreaterThan(0);
    expect(addedGW.solar).toBeCloseTo((44 + 5 * 4.38) / (0.2 * 8.76), 1);
    expect(gapAt(scenario, 2030).peakGapGW).toBeLessThan(1e-6);
  });
  it('closes the baseline gap at every anchor year', () => {
    const totals = demandTotals(projectDemand(baselineDemand));
    const noGas = { ...baselineSupply, sources: baselineSupply.sources.map((s) => (s.key === 'gas' ? { ...s, enabled: false } : s)) };
    const { scenario } = autoFill(totals, noGas);
    const years = yearRange(baselineDemand.baseYear, baselineDemand.horizonYear);
    const gap = computeGap(totals, computeSupply(scenario, years), scenario);
    for (const y of autoFillYears(years)) {
      const g = gap.find((x) => x.year === y)!;
      expect(g.gapTWh).toBeLessThan(1e-3);
      expect(g.peakGapGW).toBeLessThan(1e-3);
    }
  });
});

describe('autoAdjust', () => {
  const big = (patch: Partial<SupplySource> = {}) => src('a', { capacityGW: [{ year: 2025, gw: 40 }], ...patch });

  it('behaves like autoFill when there is a gap', () => {
    const s: SupplyScenario = { id: 'x', name: 'x', sources: [src('a'), src('b')], fillPriority: ['a', 'b'] };
    const r = autoAdjust(demand, s);
    expect(r.scenario).toEqual(autoFill(demand, s).scenario);
    expect(r.removedGW).toEqual({});
  });
  it('scales all enabled sources down by the same factor until energy matches', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x', fillPriority: [],
      sources: [big({ capacityCredit: 1 }), src('b', { capacityGW: [{ year: 2025, gw: 20 }], capacityCredit: 1 })],
    };
    const { scenario, removedGW } = autoAdjust(demand, s);
    for (const y of [2025, 2030]) {
      const g = gapAt(scenario, y);
      expect(g.coveragePct).toBeGreaterThanOrEqual(100 - 1e-6);
      expect(g.coveragePct).toBeLessThan(100.5);
      expect(g.peakGapGW).toBeLessThan(1e-6);
    }
    const [a, b] = scenario.sources;
    const ratio = (pts: { year: number; gw: number }[], y: number) => pts.find((p) => p.year === y)!.gw;
    expect(ratio(a.capacityGW, 2030) / ratio(b.capacityGW, 2030)).toBeCloseTo(2, 1);
    expect(removedGW.a).toBeGreaterThan(0);
    expect(removedGW.b).toBeGreaterThan(0);
  });
  it('keeps peak coverage at 100% when the peak binds', () => {
    // Low credit: shrinking to the energy need would leave a peak gap.
    const s: SupplyScenario = { id: 'x', name: 'x', fillPriority: [], sources: [big({ capacityCredit: 0.3 })] };
    const { scenario } = autoAdjust(demand, s);
    for (const y of [2025, 2030]) {
      const g = gapAt(scenario, y);
      expect(g.peakGapGW).toBeLessThan(1e-6);
      expect(g.coveragePct).toBeGreaterThan(100);
    }
  });
  it('leaves disabled sources untouched', () => {
    const off = src('off', { enabled: false, capacityGW: [{ year: 2025, gw: 99 }] });
    const s: SupplyScenario = { id: 'x', name: 'x', fillPriority: [], sources: [big({ capacityCredit: 1 }), off] };
    expect(autoAdjust(demand, s).scenario.sources[1]).toEqual(off);
  });
});

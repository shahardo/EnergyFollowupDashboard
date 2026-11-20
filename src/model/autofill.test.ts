import { describe, expect, it } from 'vitest';
import { fromGW as GW, fromTWh as TWh, toGW, } from './units';
import { baselineDemand, baselineSupply } from '../data/baseline';
import type { SupplyScenario, SupplySource } from '../schema';
import { autoAdjust, autoFill, autoFillYears } from './autofill';
import { demandTotals, projectDemand } from './demand';
import { computeGap } from './gap';
import { computeSupply, sourceCapacity } from './supply';
import { yearRange } from './years';

const src = (key: string, patch: Partial<SupplySource> = {}): SupplySource => ({
  key, label: key, enabled: true, renewable: false,
  capacity: [{ year: 2025, power: GW(0) }], capacityFactor: 0.5, capacityCredit: 0.5, ...patch,
});

const demand = [2025, 2026, 2027, 2028, 2029, 2030].map((year, i) => ({
  year,
  energy: TWh(44 + i * 4.38),
  peak: GW(5 + i),
}));

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
      expect(gapAt(scenario, y).gapEnergy).toBeLessThan(TWh(1e-6));
      expect(gapAt(scenario, y).peakGap).toBeLessThan(GW(1e-6));
    }
  });
  it('fills in priority order, so the first source takes everything when uncapped', () => {
    const s: SupplyScenario = { id: 'x', name: 'x', sources: [src('a'), src('b')], fillPriority: ['b', 'a'] };
    const { added } = autoFill(demand, s);
    expect(added.b).toBeGreaterThan(0);
    expect(added.a).toBeUndefined();
  });
  it('respects maxGW and moves on to the next source', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x', sources: [src('a', { maxPower: GW(3 )}), src('b')], fillPriority: ['a', 'b'],
    };
    const { scenario, added } = autoFill(demand, s);
    expect(toGW(added.a)).toBeCloseTo(3);
    expect(added.b).toBeGreaterThan(0);
    expect(gapAt(scenario, 2030).gapEnergy).toBeLessThan(TWh(1e-6));
  });
  it('keeps maxGW when the base capacity rises after an earlier addition', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x',
      sources: [src('a', { maxPower: GW(5), capacity: [{ year: 2025, power: GW(0) }, { year: 2030, power: GW(4) }] }), src('b')],
      fillPriority: ['a', 'b'],
    };
    const { scenario } = autoFill(demand, s);
    const a = scenario.sources[0].capacity;
    for (const p of a) expect(toGW(p.power)).toBeLessThanOrEqual(5 + 1e-9);
    expect(gapAt(scenario, 2030).gapEnergy).toBeLessThan(TWh(1e-6));
  });
  it('never lowers built capacity between anchors', () => {
    const shrinking = demand.map((d, i) => ({ ...d, energy: TWh(100 - i * 10), peak: GW(1) }));
    const s: SupplyScenario = { id: 'x', name: 'x', sources: [src('a')], fillPriority: ['a'] };
    const a = autoFill(shrinking, s).scenario.sources[0].capacity;
    for (let i = 1; i < a.length; i++) expect(a[i].power).toBeGreaterThanOrEqual(a[i - 1].power);
  });
  it('skips retired sources and enables disabled ones it uses', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x',
      sources: [src('old', { retireYear: 2020 }), src('new', { enabled: false, capacity: [{ year: 2025, power: GW(50) }] })],
      fillPriority: ['old', 'new'],
    };
    const { scenario, added } = autoFill(demand, s);
    expect(added.old).toBeUndefined();
    const n = scenario.sources[1];
    expect(n.enabled).toBe(true);
    // A disabled source's old anchors are not revived: only the added capacity counts.
    expect(toGW(n.capacity[0].power)).toBeCloseTo(44 / (0.5 * 8.76), 1);
  });
  it('covers the peak from firm sources before low-credit ones', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x',
      sources: [src('solar', { capacityFactor: 0.2, capacityCredit: 0.05 }), src('battery', { capacityFactor: 0, capacityCredit: 0.8 })],
      fillPriority: ['solar', 'battery'],
    };
    const { scenario, added } = autoFill(demand, s);
    // Solar covers the energy; the battery covers the peak that solar's small credit leaves.
    expect(added.battery).toBeGreaterThan(0);
    expect(toGW(added.solar)).toBeCloseTo((44 + 5 * 4.38) / (0.2 * 8.76), 1);
    expect(gapAt(scenario, 2030).peakGap).toBeLessThan(GW(1e-6));
  });
  it('closes the baseline gap at every anchor year', () => {
    const totals = demandTotals(projectDemand(baselineDemand));
    const noGas = { ...baselineSupply, sources: baselineSupply.sources.map((s) => (s.key === 'gas' ? { ...s, enabled: false } : s)) };
    const { scenario } = autoFill(totals, noGas);
    const years = yearRange(baselineDemand.baseYear, baselineDemand.horizonYear);
    const gap = computeGap(totals, computeSupply(scenario, years), scenario);
    for (const y of autoFillYears(years)) {
      const g = gap.find((x) => x.year === y)!;
      expect(g.gapEnergy).toBeLessThan(TWh(1e-3));
      expect(g.peakGap).toBeLessThan(GW(1e-3));
    }
  });
});

describe('autoAdjust', () => {
  const big = (patch: Partial<SupplySource> = {}) => src('a', { capacity: [{ year: 2025, power: GW(40) }], ...patch });

  it('behaves like autoFill when there is a gap', () => {
    const s: SupplyScenario = { id: 'x', name: 'x', sources: [src('a'), src('b')], fillPriority: ['a', 'b'] };
    const r = autoAdjust(demand, s);
    expect(r.scenario).toEqual(autoFill(demand, s).scenario);
    expect(r.removed).toEqual({});
  });
  it('scales all enabled sources down by the same factor until energy matches', () => {
    const s: SupplyScenario = {
      id: 'x', name: 'x', fillPriority: [],
      sources: [big({ capacityCredit: 1 }), src('b', { capacity: [{ year: 2025, power: GW(20) }], capacityCredit: 1 })],
    };
    const { scenario, removed } = autoAdjust(demand, s);
    for (const y of [2025, 2030]) {
      const g = gapAt(scenario, y);
      expect(g.coverage).toBeGreaterThanOrEqual(1 - 1e-8);
      expect(g.coverage).toBeLessThan(1.005);
      expect(g.peakGap).toBeLessThan(GW(1e-6));
    }
    const [a, b] = scenario.sources;
    const ratio = (pts: { year: number; power: number }[], y: number) => pts.find((p) => p.year === y)!.power;
    expect(ratio(a.capacity, 2030) / ratio(b.capacity, 2030)).toBeCloseTo(2, 1);
    expect(removed.a).toBeGreaterThan(0);
    expect(removed.b).toBeGreaterThan(0);
  });
  it('keeps peak coverage at 100% when the peak binds', () => {
    // Low credit: shrinking to the energy need would leave a peak gap.
    const s: SupplyScenario = { id: 'x', name: 'x', fillPriority: [], sources: [big({ capacityCredit: 0.3 })] };
    const { scenario } = autoAdjust(demand, s);
    for (const y of [2025, 2030]) {
      const g = gapAt(scenario, y);
      expect(g.peakGap).toBeLessThan(GW(1e-6));
      expect(g.coverage).toBeGreaterThan(1);
    }
  });
  it('leaves disabled sources untouched', () => {
    const off = src('off', { enabled: false, capacity: [{ year: 2025, power: GW(99) }] });
    const s: SupplyScenario = { id: 'x', name: 'x', fillPriority: [], sources: [big({ capacityCredit: 1 }), off] };
    expect(autoAdjust(demand, s).scenario.sources[1]).toEqual(off);
  });
});

describe('autoFill start years', () => {
  const totals = demandTotals(projectDemand(baselineDemand));
  it('adds nothing to a source before its start year, and the same as before without options', () => {
    const plain = autoFill(totals, baselineSupply);
    expect(autoFill(totals, baselineSupply, {}).scenario).toEqual(plain.scenario);
    const first = baselineSupply.fillPriority[0];
    const before = baselineSupply.sources.find((s) => s.key === first)!;
    const res = autoFill(totals, baselineSupply, { startYear: { [first]: 2038 } });
    const after = res.scenario.sources.find((s) => s.key === first)!;
    for (let y = 2025; y < 2038; y++) {
      expect(sourceCapacity(after, y), String(y)).toBeLessThanOrEqual(sourceCapacity(before, y) + GW(0.011));
    }
  });
});

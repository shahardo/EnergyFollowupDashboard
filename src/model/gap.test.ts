import { describe, expect, it } from 'vitest';
import { baselineDemand, baselineSupply } from '../data/baseline';
import { demandTotals, projectDemand } from './demand';
import { computeGap } from './gap';
import { computeSupply } from './supply';
import { fromGW as GW, fromTWh as TWh, toGW, toTWh } from './units';
import { yearRange } from './years';

describe('computeGap', () => {
  const scenario = {
    id: 's', name: 's', fillPriority: [],
    sources: [
      { key: 'solar', label: 'סולארי', enabled: true, renewable: true, capacity: [{ year: 2025, power: GW(10) }], capacityFactor: 0.2, capacityCredit: 0.1 },
      { key: 'gas', label: 'גז', enabled: true, renewable: false, capacity: [{ year: 2025, power: GW(5) }], capacityFactor: 0.5, capacityCredit: 1 },
    ],
  };
  const supply = computeSupply(scenario, [2025]);
  const demand = (twh: number, gw: number) => [{ year: 2025, energy: TWh(twh), peak: GW(gw) }];

  it('computes energy gap, coverage and renewable share', () => {
    const [g] = computeGap(demand(50, 8), supply, scenario);
    expect(toTWh(g.supplyEnergy)).toBeCloseTo(17.52 + 21.9);
    expect(toTWh(g.gapEnergy)).toBeCloseTo(50 - 39.42);
    expect(g.coverage).toBeCloseTo(39.42 / 50);
    expect(g.renewableShare).toBeCloseTo(17.52 / 39.42);
  });
  it('computes the peak gap from firm capacity', () => {
    const [g] = computeGap(demand(50, 8), supply, scenario);
    expect(toGW(g.firmPower)).toBeCloseTo(6);
    expect(toGW(g.peakGap)).toBeCloseTo(2);
  });
  it('has no gap when supply exceeds demand', () => {
    const [g] = computeGap(demand(10, 1), supply, scenario);
    expect(g.gapEnergy).toBe(0);
    expect(g.peakGap).toBe(0);
  });
});

describe('baseline data', () => {
  it('parses and produces a full series', () => {
    const years = yearRange(baselineDemand.baseYear, baselineDemand.horizonYear);
    const gap = computeGap(
      demandTotals(projectDemand(baselineDemand)),
      computeSupply(baselineSupply, years),
      baselineSupply,
    );
    expect(gap).toHaveLength(26);
    expect(toTWh(gap[0].demandEnergy)).toBeCloseTo(76.5); // 70 + 6.5 (רשות פלסטינית)
  });
});

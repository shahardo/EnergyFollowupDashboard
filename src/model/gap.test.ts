import { describe, expect, it } from 'vitest';
import { baselineDemand, baselineSupply } from '../data/baseline';
import { demandTotals, projectDemand } from './demand';
import { computeGap } from './gap';
import { computeSupply } from './supply';
import { yearRange } from './years';

describe('computeGap', () => {
  const scenario = {
    id: 's', name: 's', fillPriority: [],
    sources: [
      { key: 'solar', label: 'סולארי', enabled: true, renewable: true, capacityGW: [{ year: 2025, gw: 10 }], capacityFactor: 0.2, capacityCredit: 0.1 },
      { key: 'gas', label: 'גז', enabled: true, renewable: false, capacityGW: [{ year: 2025, gw: 5 }], capacityFactor: 0.5, capacityCredit: 1 },
    ],
  };
  const supply = computeSupply(scenario, [2025]);

  it('computes energy gap, coverage and renewable share', () => {
    const [g] = computeGap([{ year: 2025, twh: 50, peakGW: 8 }], supply, scenario);
    expect(g.supplyTWh).toBeCloseTo(17.52 + 21.9);
    expect(g.gapTWh).toBeCloseTo(50 - 39.42);
    expect(g.coveragePct).toBeCloseTo((39.42 / 50) * 100);
    expect(g.renewablePct).toBeCloseTo((17.52 / 39.42) * 100);
  });
  it('computes the peak gap from firm capacity', () => {
    const [g] = computeGap([{ year: 2025, twh: 50, peakGW: 8 }], supply, scenario);
    expect(g.firmGW).toBeCloseTo(6);
    expect(g.peakGapGW).toBeCloseTo(2);
  });
  it('has no gap when supply exceeds demand', () => {
    const [g] = computeGap([{ year: 2025, twh: 10, peakGW: 1 }], supply, scenario);
    expect(g.gapTWh).toBe(0);
    expect(g.peakGapGW).toBe(0);
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
    expect(gap[0].demandTWh).toBeCloseTo(70);
  });
});

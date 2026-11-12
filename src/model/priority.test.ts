import { describe, expect, it } from 'vitest';
import { DEMAND_PRESETS, SUPPLY_PRESETS, demandPresets, supplyPresets } from '../data/baseline';
import { defaultMaxGW, defaultStartYears, defaultWeights, scoreFor, weightPresets } from '../data/trilemma';
import type { DemandPreset } from '../schema';
import { computeDemandSeries } from './series';
import { computeSupply, sourceCapacity } from './supply';
import {
  effectiveStartYear,
  idealSupply,
  meritScore,
  mixMetrics,
  normalizeWeights,
  rankSources,
  type IdealOptions,
} from './priority';

const net = (p: DemandPreset) => computeDemandSeries(demandPresets[p]).totals;
const opts = (patch: Partial<IdealOptions> = {}): IdealOptions => ({
  weights: defaultWeights,
  minFeasibilityPct: 20,
  retireBelow: 5,
  retireByYear: 2040,
  maxGW: defaultMaxGW,
  startYears: defaultStartYears,
  ...patch,
});

describe('priority weights and merit', () => {
  it('normalises weights to a sum of 1, and equal weights for a zero sum', () => {
    const n = normalizeWeights({ sustainability: 80, affordability: 10, security: 10, feasibility: 0 });
    expect(n.sustainability).toBeCloseTo(0.8);
    expect(n.feasibility).toBe(0);
    const z = normalizeWeights({ sustainability: 0, affordability: 0, security: 0, feasibility: 0 });
    expect(z.security).toBeCloseTo(0.25);
  });
  it('scores a channel as the weighted sum, feasibility on a 0..10 scale', () => {
    const s = { security: 6, affordability: 9, sustainability: 9, feasibilityPct: 90 };
    expect(meritScore(s, { sustainability: 1, affordability: 0, security: 0, feasibility: 0 })).toBeCloseTo(9);
    expect(meritScore(s, { sustainability: 0, affordability: 0, security: 0, feasibility: 1 })).toBeCloseTo(9);
    expect(meritScore(s, { sustainability: 70, affordability: 10, security: 10, feasibility: 10 })).toBeCloseTo(8.7);
  });
  it('ranks by merit, keeps the original order on ties, and marks eligibility and retirement', () => {
    const sc = supplyPresets.medium.declared;
    const r = rankSources(sc.sources, scoreFor, opts(), 2025);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].merit).toBeGreaterThanOrEqual(r[i].merit);
    expect(r[0].key).toBe('solar');
    expect(r.find((x) => x.key === 'fusion')!.eligible).toBe(false);
    expect(r.find((x) => x.key === 'coal')!.retiring).toBe(true);
    // ערוץ בלי צי קיים לא "מושבת"
    expect(r.find((x) => x.key === 'lng')!.retiring).toBe(false);
    const same = { security: 5, affordability: 5, sustainability: 5, feasibilityPct: 50 };
    const tied = rankSources(sc.sources, () => same, opts(), 2025);
    expect(tied.map((x) => x.key)).toEqual(sc.sources.map((s) => s.key));
  });
});

describe('idealSupply', () => {
  it('meets demand (energy and peak) every year and respects the caps, for every demand and policy', () => {
    for (const d of DEMAND_PRESETS) {
      const demand = net(d);
      const years = demand.map((x) => x.year);
      for (const p of SUPPLY_PRESETS) {
        const res = idealSupply(demand, supplyPresets[d][p], scoreFor, opts());
        expect(res.shortfall, `${d}/${p}`).toEqual([]);
        for (const s of res.scenario.sources) {
          const cap = defaultMaxGW[s.key];
          if (cap === null || cap === undefined) continue;
          for (const y of years) {
            const existing = sourceCapacity(supplyPresets[d][p].sources.find((x) => x.key === s.key)!, years[0]);
            expect(sourceCapacity(s, y)).toBeLessThanOrEqual(Math.max(cap, existing) + 0.011);
          }
        }
      }
    }
  });
  it('phases out the existing fleet of a low-merit channel by the retire year', () => {
    const demand = net('medium');
    const res = idealSupply(demand, supplyPresets.medium.declared, scoreFor, opts({ retireByYear: 2030 }));
    expect(res.retired).toContain('coal');
    const coal = res.scenario.sources.find((s) => s.key === 'coal')!;
    expect(sourceCapacity(coal, 2030)).toBe(0);
    expect(sourceCapacity(coal, 2050)).toBe(0);
  });
  it('keeps the existing fleet without early retirement when the threshold is 0', () => {
    const demand = net('medium');
    const res = idealSupply(demand, supplyPresets.medium.reference, scoreFor, opts({ retireBelow: 0 }));
    expect(res.retired).toEqual([]);
  });
  it('more weight on sustainability means fewer emissions in 2050', () => {
    const demand = net('medium');
    const years = demand.map((x) => x.year);
    const co2 = (w: IdealOptions['weights']) => {
      const res = idealSupply(demand, supplyPresets.medium.declared, scoreFor, opts({ weights: w }));
      return mixMetrics(computeSupply(res.scenario, years), scoreFor).at(-1)!.mtCo2;
    };
    expect(co2(weightPresets.climate)).toBeLessThan(co2(weightPresets.security));
  });
  it('fillPriority is the ranking of the eligible channels', () => {
    const res = idealSupply(net('low'), supplyPresets.low.tested, scoreFor, opts());
    expect(res.scenario.fillPriority).toEqual(res.ranking.filter((r) => r.eligible).map((r) => r.key));
  });
});

describe('mixMetrics', () => {
  it('weights the scores by energy and sums emissions', () => {
    const pts = [
      { year: 2030, source: 'solar', gw: 1, twh: 30, firmGW: 0 },
      { year: 2030, source: 'gas', gw: 1, twh: 10, firmGW: 1 },
    ];
    const [m] = mixMetrics(pts, scoreFor);
    expect(m.score.sustainability).toBeCloseTo((9 * 30 + 4 * 10) / 40);
    expect(m.mtCo2).toBeCloseTo(30 * 0.048 + 10 * 0.49);
  });
});

describe('start years', () => {
  const fusion = { earliest: 2035, realistic: 2045 };
  it('slides from the earliest year (weight 0) to the realistic year (weight 0.5 and up)', () => {
    expect(effectiveStartYear(fusion, 0)).toBe(2035);
    expect(effectiveStartYear(fusion, 0.25)).toBe(2040);
    expect(effectiveStartYear(fusion, 0.5)).toBe(2045);
    expect(effectiveStartYear(fusion, 1)).toBe(2045);
    expect(effectiveStartYear({ earliest: 2035, realistic: 2030 }, 0.5)).toBe(2035);
  });

  // היתוך עם ציונים מלאים בראש הדירוג, בלי סף יישימות ובלי תקרה: נבנה ברגע שמותר.
  const best = { security: 10, affordability: 10, sustainability: 10, feasibilityPct: 100 };
  const scores = (k: string) => (k === 'fusion' ? best : scoreFor(k));
  const fusionFirst = (feasibility: number) =>
    opts({
      weights: { sustainability: 100 - feasibility, affordability: 0, security: 0, feasibility },
      minFeasibilityPct: 0,
      retireBelow: 0,
      maxGW: { ...defaultMaxGW, fusion: null },
    });
  const fusionGW = (o: IdealOptions, year: number) => {
    const res = idealSupply(net('medium'), supplyPresets.medium.tested, scores, o);
    return sourceCapacity(res.scenario.sources.find((s) => s.key === 'fusion')!, year);
  };

  it('builds nothing in a channel before its start year', () => {
    const o = fusionFirst(0);
    for (let y = 2025; y < 2035; y++) expect(fusionGW(o, y), String(y)).toBeCloseTo(0, 9);
    expect(fusionGW(o, 2035)).toBeGreaterThan(0);
  });
  it('a high feasibility weight pushes the start to the realistic year', () => {
    const o = fusionFirst(50);
    for (let y = 2025; y < 2045; y++) expect(fusionGW(o, y), String(y)).toBeCloseTo(0, 9);
    expect(fusionGW(o, 2045)).toBeGreaterThan(0);
  });
  it('still meets demand every year with start years', () => {
    for (const d of DEMAND_PRESETS) {
      const res = idealSupply(net(d), supplyPresets[d].declared, scores, fusionFirst(0));
      expect(res.shortfall, d).toEqual([]);
    }
  });
});

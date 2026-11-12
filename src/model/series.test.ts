import { describe, expect, it } from 'vitest';
import { baselineDemand, baselineSupply } from '../data/baseline';
import { seriesFor } from '../store/useSeries';
import { computeDemandSeries, computeSeries } from './series';

describe('series', () => {
  it('net totals are below gross when measures are set', () => {
    const d = computeDemandSeries(baselineDemand);
    const last = d.totals.length - 1;
    expect(d.totals[last].twh).toBeLessThan(d.grossTotals[last].twh);
    expect(computeSeries(d, baselineSupply).gap).toHaveLength(d.years.length);
  });

  it('seriesFor memoises on scenario identity and reuses the demand side', () => {
    const a = seriesFor(baselineDemand, baselineSupply);
    expect(seriesFor(baselineDemand, baselineSupply)).toBe(a);
    const b = seriesFor(baselineDemand, { ...baselineSupply });
    expect(b).not.toBe(a);
    expect(b.demandPoints).toBe(a.demandPoints);
  });
});

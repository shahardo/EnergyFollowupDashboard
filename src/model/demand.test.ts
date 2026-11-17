import { describe, expect, it } from 'vitest';
import type { SectorDemand } from '../schema';
import { demandTotals, peakFromEnergy, projectDemand, sectorEnergy } from './demand';
import { fromGW as GW, fromTWh as TWh, toTWh } from './units';

const base: SectorDemand = {
  key: 'x', label: 'x', baseEnergy: TWh(10), growthRate: 0.1, curve: 'linear', efficiencyRate: 0, loadFactor: 0.5,
};
const twh = (s: SectorDemand, y: number) => toTWh(sectorEnergy(s, y, 2025, 2050));

describe('sectorEnergy', () => {
  it('returns the base value in the base year for every curve', () => {
    for (const curve of ['linear', 'exp', 's'] as const) expect(twh({ ...base, curve }, 2025)).toBeCloseTo(10);
  });
  it('linear grows by a fixed amount', () => {
    expect(twh(base, 2027)).toBeCloseTo(12);
  });
  it('exp compounds', () => {
    expect(twh({ ...base, curve: 'exp' }, 2027)).toBeCloseTo(12.1);
  });
  it('s-curve reaches the exp value at the horizon and is monotonic', () => {
    const s = { ...base, curve: 's' as const, sMidYear: 2035 };
    expect(twh(s, 2050)).toBeCloseTo(10 * 1.1 ** 25);
    let prev = 0;
    for (let y = 2025; y <= 2050; y++) {
      const v = twh(s, y);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('applies efficiency as a compounding reduction', () => {
    expect(twh({ ...base, growthRate: 0, efficiencyRate: 0.1 }, 2027)).toBeCloseTo(8.1);
  });
});

describe('peak and totals', () => {
  it('peak W = J / (seconds per year × LF): 8.76 TWh at LF 0.5 is 2 GW', () => {
    expect(peakFromEnergy(TWh(8.76), 0.5) / GW(2)).toBeCloseTo(1, 12);
  });
  it('sums sectors per year', () => {
    const totals = demandTotals(
      projectDemand({ id: 'a', name: 'a', baseYear: 2025, horizonYear: 2026, sectors: [base, { ...base, key: 'y' }] }),
    );
    expect(totals).toHaveLength(2);
    expect(toTWh(totals[0].energy)).toBeCloseTo(20);
    expect(toTWh(totals[1].energy)).toBeCloseTo(22);
  });
});

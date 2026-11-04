import { describe, expect, it } from 'vitest';
import type { SectorDemand } from '../schema';
import { demandTotals, peakFromEnergy, projectDemand, sectorTWh } from './demand';

const base: SectorDemand = {
  key: 'x', label: 'x', baseTWh: 10, growthPct: 10, curve: 'linear', efficiencyPct: 0, loadFactor: 0.5,
};

describe('sectorTWh', () => {
  it('returns the base value in the base year for every curve', () => {
    for (const curve of ['linear', 'exp', 's'] as const) {
      expect(sectorTWh({ ...base, curve }, 2025, 2025, 2050)).toBeCloseTo(10);
    }
  });
  it('linear grows by a fixed amount', () => {
    expect(sectorTWh(base, 2027, 2025, 2050)).toBeCloseTo(12);
  });
  it('exp compounds', () => {
    expect(sectorTWh({ ...base, curve: 'exp' }, 2027, 2025, 2050)).toBeCloseTo(12.1);
  });
  it('s-curve reaches the exp value at the horizon and is monotonic', () => {
    const s = { ...base, curve: 's' as const, sMidYear: 2035 };
    expect(sectorTWh(s, 2050, 2025, 2050)).toBeCloseTo(10 * 1.1 ** 25);
    let prev = 0;
    for (let y = 2025; y <= 2050; y++) {
      const v = sectorTWh(s, y, 2025, 2050);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('applies efficiency as a compounding reduction', () => {
    expect(sectorTWh({ ...base, growthPct: 0, efficiencyPct: 10 }, 2027, 2025, 2050)).toBeCloseTo(8.1);
  });
});

describe('peak and totals', () => {
  it('GW = TWh / (8.76 * LF)', () => {
    expect(peakFromEnergy(8.76, 0.5)).toBeCloseTo(2);
  });
  it('sums sectors per year', () => {
    const totals = demandTotals(
      projectDemand({ id: 'a', name: 'a', baseYear: 2025, horizonYear: 2026, sectors: [base, { ...base, key: 'y' }] }),
    );
    expect(totals).toHaveLength(2);
    expect(totals[0].twh).toBeCloseTo(20);
    expect(totals[1].twh).toBeCloseTo(22);
  });
});

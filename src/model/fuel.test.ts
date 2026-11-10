import { describe, expect, it } from 'vitest';
import { fuelRatios, sourceBcm, sourceMtoe, TOE_PER_TWH, TWH_TH_PER_BCM } from './fuel';

const pt = (year: number, source: string, twh: number) => ({
  year,
  source,
  twh,
  gw: 0,
  firmGW: 0,
});

describe('fuel', () => {
  it('renewables convert 1:1, fuels by plant efficiency', () => {
    expect(sourceMtoe('solar', 10)).toBeCloseTo(10 * TOE_PER_TWH);
    expect(sourceMtoe('gas', 10)).toBeCloseTo(20 * TOE_PER_TWH);
    expect(sourceMtoe('unknown', 1)).toBeCloseTo(TOE_PER_TWH);
  });

  it('only gas sources use gas', () => {
    expect(sourceBcm('gas', 10.3)).toBeCloseTo(2);
    expect(sourceBcm('lng', TWH_TH_PER_BCM / 2)).toBeCloseTo(1);
    expect(sourceBcm('coal', 50)).toBe(0);
    expect(sourceBcm('solar', 50)).toBe(0);
  });

  it('ratios follow the yearly mix, 0 without supply', () => {
    const r = fuelRatios([pt(2030, 'gas', 10), pt(2030, 'solar', 10)], [2030, 2031]);
    expect(r[0].mtoePerTWh).toBeCloseTo((30 * TOE_PER_TWH) / 20);
    expect(r[0].bcmPerTWh).toBeCloseTo(20 / TWH_TH_PER_BCM / 20);
    expect(r[1]).toEqual({ year: 2031, mtoePerTWh: 0, bcmPerTWh: 0 });
  });
});

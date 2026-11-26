import { describe, expect, it } from 'vitest';
import { fromTWh } from '../../model/units';
import { energyFactor, fuelValue, ratioOf, unitInfo } from './unitSeries';

describe('total-energy unit', () => {
  it('converts J to million toe, PJ and TWh', () => {
    const j = fromTWh(100);
    expect(j * energyFactor('twh')).toBeCloseTo(100, 9);
    expect(j * energyFactor('pj')).toBeCloseTo(360, 9);
    expect(j * energyFactor('mtoe')).toBeCloseTo(8.598, 3);
  });

  it('drives the toe mode only; electricity TWh stays TWh', () => {
    expect(ratioOf('toe', undefined, 'pj')).toBe(energyFactor('pj'));
    expect(ratioOf('twh', undefined, 'pj')).toBe(energyFactor('twh'));
    expect(fuelValue('toe', 'importFossil', fromTWh(1), 'twh')).toBeCloseTo(1, 9);
    expect(unitInfo('toe', 'pj')).toEqual({ unit: 'PJ', digits: 0 });
    expect(unitInfo('toe').unit).toBe('מיליון שעט"ן');
    expect(unitInfo('twh', 'pj').unit).toBe('TWh');
  });
});

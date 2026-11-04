import { describe, expect, it } from 'vitest';
import type { SupplySource } from '../schema';
import { computeSupply, interpolateCapacity, sourceCapacity } from './supply';

const points = [{ year: 2030, gw: 10 }, { year: 2025, gw: 0 }, { year: 2040, gw: 30 }];

describe('interpolateCapacity', () => {
  it('interpolates linearly between unsorted anchors', () => {
    expect(interpolateCapacity(points, 2027)).toBeCloseTo(4);
    expect(interpolateCapacity(points, 2035)).toBeCloseTo(20);
  });
  it('holds flat outside the anchors', () => {
    expect(interpolateCapacity(points, 2020)).toBe(0);
    expect(interpolateCapacity(points, 2050)).toBe(30);
  });
});

const src: SupplySource = {
  key: 'coal', label: 'פחם', enabled: true, renewable: false,
  capacityGW: [{ year: 2025, gw: 5 }], capacityFactor: 0.5, capacityCredit: 0.9, retireYear: 2028,
};

describe('sourceCapacity / computeSupply', () => {
  it('drops to zero from the retire year', () => {
    expect(sourceCapacity(src, 2027)).toBe(5);
    expect(sourceCapacity(src, 2028)).toBe(0);
  });
  it('is zero when disabled', () => {
    expect(sourceCapacity({ ...src, enabled: false }, 2025)).toBe(0);
  });
  it('TWh = GW * CF * 8.76 and firm = GW * credit', () => {
    const [p] = computeSupply({ id: 's', name: 's', sources: [src], fillPriority: [] }, [2025]);
    expect(p.twh).toBeCloseTo(5 * 0.5 * 8.76);
    expect(p.firmGW).toBeCloseTo(4.5);
  });
});

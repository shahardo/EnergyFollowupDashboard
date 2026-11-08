import { describe, expect, it } from 'vitest';
import { centeredRange } from './sliderRange';
import { setCapacityAt } from './supply';

describe('centeredRange', () => {
  it('puts the base exactly in the middle', () => {
    for (const base of [2, 1.5, 15, 10, -1, 0]) {
      const r = centeredRange(base, 3);
      expect((r.min + r.max) / 2).toBeCloseTo(base);
    }
  });
  it('uses |base| as the span when larger than the minimum', () => {
    expect(centeredRange(15, 3)).toMatchObject({ min: 0, max: 30 });
    expect(centeredRange(2, 3)).toMatchObject({ min: -1, max: 5 });
  });
  it('respects a floor by widening upward', () => {
    const r = centeredRange(40, 10, 0);
    expect(r).toMatchObject({ min: 0, max: 80 });
    expect(centeredRange(3, 5, 0)).toMatchObject({ min: 0, max: 6 });
    expect(centeredRange(0, 5, 0)).toMatchObject({ min: 0, max: 10 });
  });
});

describe('setCapacityAt', () => {
  it('updates an existing anchor or adds one, keeping order', () => {
    const pts = [{ year: 2025, gw: 1 }, { year: 2050, gw: 5 }];
    expect(setCapacityAt(pts, 2050, 8)).toEqual([{ year: 2025, gw: 1 }, { year: 2050, gw: 8 }]);
    expect(setCapacityAt(pts, 2030, 3).map((p) => p.year)).toEqual([2025, 2030, 2050]);
  });
});

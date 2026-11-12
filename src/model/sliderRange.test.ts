import { describe, expect, it } from 'vitest';
import { centeredRange } from './sliderRange';
import { scaleCapacityFrom, setCapacityAt } from './supply';

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

describe('scaleCapacityFrom', () => {
  it('scales every point from 2030 to the horizon by the same factor, keeping earlier points', () => {
    const pts = [{ year: 2025, gw: 1 }, { year: 2030, gw: 4 }, { year: 2040, gw: 6 }, { year: 2050, gw: 10 }];
    expect(scaleCapacityFrom(pts, 2030, 2050, 20)).toEqual([
      { year: 2025, gw: 1 }, { year: 2030, gw: 8 }, { year: 2040, gw: 12 }, { year: 2050, gw: 20 },
    ]);
  });
  it('inserts a 2030 point at its interpolated value times the factor', () => {
    const pts = [{ year: 2025, gw: 0 }, { year: 2035, gw: 10 }, { year: 2050, gw: 10 }];
    expect(scaleCapacityFrom(pts, 2030, 2050, 5)).toEqual([
      { year: 2025, gw: 0 }, { year: 2030, gw: 2.5 }, { year: 2035, gw: 5 }, { year: 2050, gw: 5 },
    ]);
  });
  it('adds a horizon point when the last anchor is earlier', () => {
    const pts = [{ year: 2025, gw: 2 }, { year: 2040, gw: 4 }];
    expect(scaleCapacityFrom(pts, 2030, 2050, 8)).toEqual([
      { year: 2025, gw: 2 }, { year: 2030, gw: 5.33 }, { year: 2040, gw: 8 }, { year: 2050, gw: 8 },
    ]);
  });
  it('falls back to setting only the horizon when its old value is 0', () => {
    const pts = [{ year: 2025, gw: 0 }, { year: 2050, gw: 0 }];
    expect(scaleCapacityFrom(pts, 2030, 2050, 3)).toEqual([{ year: 2025, gw: 0 }, { year: 2050, gw: 3 }]);
  });
});

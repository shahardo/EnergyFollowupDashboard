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

// GW → W, כדי שהציפיות יהיו מספרים מדויקים (העיגול הוא לצעד של 0.01 GW).
const G = 1e9;
const pt = (year: number, gw: number) => ({ year, power: gw * G });

describe('setCapacityAt', () => {
  it('updates an existing anchor or adds one, keeping order', () => {
    const pts = [pt(2025, 1), pt(2050, 5)];
    expect(setCapacityAt(pts, 2050, 8 * G)).toEqual([pt(2025, 1), pt(2050, 8)]);
    expect(setCapacityAt(pts, 2030, 3 * G).map((p) => p.year)).toEqual([2025, 2030, 2050]);
  });
});

describe('scaleCapacityFrom', () => {
  it('scales every point from 2030 to the horizon by the same factor, keeping earlier points', () => {
    const pts = [pt(2025, 1), pt(2030, 4), pt(2040, 6), pt(2050, 10)];
    expect(scaleCapacityFrom(pts, 2030, 2050, 20 * G)).toEqual([pt(2025, 1), pt(2030, 8), pt(2040, 12), pt(2050, 20)]);
  });
  it('inserts a 2030 point at its interpolated value times the factor', () => {
    const pts = [pt(2025, 0), pt(2035, 10), pt(2050, 10)];
    expect(scaleCapacityFrom(pts, 2030, 2050, 5 * G)).toEqual([
      pt(2025, 0), { year: 2030, power: 2.5e9 }, pt(2035, 5), pt(2050, 5),
    ]);
  });
  it('adds a horizon point when the last anchor is earlier', () => {
    const pts = [pt(2025, 2), pt(2040, 4)];
    expect(scaleCapacityFrom(pts, 2030, 2050, 8 * G)).toEqual([
      pt(2025, 2), { year: 2030, power: 5.33e9 }, pt(2040, 8), pt(2050, 8),
    ]);
  });
  it('falls back to setting only the horizon when its old value is 0', () => {
    const pts = [pt(2025, 0), pt(2050, 0)];
    expect(scaleCapacityFrom(pts, 2030, 2050, 3 * G)).toEqual([pt(2025, 0), pt(2050, 3)]);
  });
});

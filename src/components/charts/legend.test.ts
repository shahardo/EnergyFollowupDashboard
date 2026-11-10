import { describe, expect, it } from 'vitest';
import { legendTextCap, splitLegend } from './legend';

describe('splitLegend', () => {
  it('puts the larger half in the first row', () => {
    expect(splitLegend([1, 2, 3, 4, 5])).toEqual([[1, 2, 3], [4, 5]]);
    expect(splitLegend([1, 2])).toEqual([[1], [2]]);
    expect(splitLegend([])).toEqual([[], []]);
  });
});

describe('legendTextCap', () => {
  it('returns null when the row fits', () => {
    expect(legendTextCap([40, 50], 200, 20)).toBeNull();
  });
  it('caps only the long labels so the row fits', () => {
    const widths = [20, 100, 120];
    const cap = legendTextCap(widths, 200, 20)!;
    expect(cap).toBe(60);
    const used = widths.reduce((a, w) => a + Math.min(w, cap), 0) + 20 * widths.length;
    expect(used).toBeLessThanOrEqual(200);
  });
  it('returns 0 when even the icons do not fit', () => {
    expect(legendTextCap([10, 10], 30, 20)).toBe(0);
  });
});

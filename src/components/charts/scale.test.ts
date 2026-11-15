import { describe, expect, it } from 'vitest';
import { niceAxisMax, seriesMax } from './scale';

describe('niceAxisMax', () => {
  it('rounds up to a nice top with about five intervals', () => {
    expect(niceAxisMax(233)).toEqual({ max: 250, interval: 50 });
    expect(niceAxisMax(41)).toEqual({ max: 50, interval: 10 });
    expect(niceAxisMax(17.3)).toEqual({ max: 20, interval: 5 });
    expect(niceAxisMax(300)).toEqual({ max: 300, interval: 100 });
    expect(niceAxisMax(0)).toEqual({ max: 1, interval: 0.2 });
  });
  it('the top is never below the value', () => {
    for (const v of [0.37, 3.3, 12, 99.9, 101, 1234]) expect(niceAxisMax(v).max).toBeGreaterThanOrEqual(v);
  });
});

describe('seriesMax', () => {
  it('takes the stack sum, the reduction top and the lines', () => {
    const stacked = [{ values: [1, 2] }, { values: [3, 4] }];
    expect(seriesMax({ stacked })).toBe(6);
    expect(seriesMax({ stacked, reduction: { net: [5, 5], layers: [{ values: [2, 3] }] } })).toBe(8);
    expect(seriesMax({ stacked, lines: [{ values: [null, 9] }, undefined] })).toBe(9);
  });
});

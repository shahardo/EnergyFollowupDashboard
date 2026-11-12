import { describe, expect, it } from 'vitest';
import { pickHovered, stackBands } from './hover';

describe('stackBands', () => {
  it('stacks layers on a base, null as 0', () => {
    const bands = stackBands(null, [
      { seriesIndex: 0, values: [1, 2] },
      { seriesIndex: 1, values: [null, 3] },
    ]);
    expect(bands).toEqual([
      { seriesIndex: 0, lower: [0, 0], upper: [1, 2] },
      { seriesIndex: 1, lower: [1, 2], upper: [1, 5] },
    ]);
    expect(stackBands([10, 10], [{ seriesIndex: 5, values: [1, 2] }])[0]).toEqual({
      seriesIndex: 5,
      lower: [10, 10],
      upper: [11, 12],
    });
  });
});

describe('pickHovered', () => {
  const bands = stackBands(null, [
    { seriesIndex: 0, values: [2, 4] },
    { seriesIndex: 1, values: [2, 4] },
  ]);
  it('finds the band under the pointer, interpolating between years', () => {
    expect(pickHovered(bands, [], 0, 1, 0.1)).toBe(0);
    expect(pickHovered(bands, [], 0, 3, 0.1)).toBe(1);
    // באמצע: הגבול בין השכבות ב-3, הראש ב-6.
    expect(pickHovered(bands, [], 0.5, 2.9, 0.1)).toBe(0);
    expect(pickHovered(bands, [], 0.5, 3.1, 0.1)).toBe(1);
    expect(pickHovered(bands, [], 0.5, 6.5, 0.1)).toBeNull();
  });
  it('prefers a nearby line, and earlier bands on overlap', () => {
    const line = { seriesIndex: 9, values: [3, 3] };
    expect(pickHovered(bands, [line], 0, 3.05, 0.1)).toBe(9);
    expect(pickHovered(bands, [line], 0, 3.5, 0.1)).toBe(1);
    const top = { seriesIndex: 7, lower: [0, 0], upper: [10, 10] };
    expect(pickHovered([top, ...bands], [], 0, 1, 0.1)).toBe(7);
  });
});

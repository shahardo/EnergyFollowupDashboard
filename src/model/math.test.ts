import { describe, expect, it } from 'vitest';
import { clamp, linearShare, round2, roundUp2 } from './math';

describe('math helpers', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('linearShare ramps 0..1 and handles a degenerate range', () => {
    expect(linearShare(2025, 2025, 2050)).toBe(0);
    expect(linearShare(2050, 2025, 2050)).toBe(1);
    expect(linearShare(2060, 2025, 2050)).toBe(1);
    expect(linearShare(2030, 2025, 2035)).toBeCloseTo(0.5);
    expect(linearShare(2024, 2025, 2025)).toBe(0);
    expect(linearShare(2025, 2025, 2025)).toBe(1);
  });

  it('roundUp2 rounds up but tolerates float noise; round2 rounds', () => {
    expect(roundUp2(1.231)).toBe(1.24);
    expect(roundUp2(1.23)).toBe(1.23);
    expect(roundUp2(1.2300000001)).toBe(1.23);
    expect(round2(1.234)).toBe(1.23);
  });
});

import { describe, expect, it } from 'vitest';
import { clamp, linearShare, round2, roundPower, roundUpPower } from './math';
import { fromGW as GW } from './units';

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

  it('roundUpPower rounds W up to 0.01 GW but tolerates float noise; roundPower rounds', () => {
    expect(roundUpPower(GW(1.231))).toBe(1.24e9);
    expect(roundUpPower(GW(1.23))).toBe(1.23e9);
    expect(roundUpPower(GW(1.2300000001))).toBe(1.23e9);
    expect(roundPower(GW(1.234))).toBe(1.23e9);
    expect(round2(1.234)).toBe(1.23);
  });
});

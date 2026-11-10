import { describe, expect, it } from 'vitest';
import { fmtPct } from './format';

describe('fmtPct', () => {
  it('rounds to a whole percent', () => {
    expect(fmtPct(93.4)).toBe('93%');
    expect(fmtPct(103.2)).toBe('103%');
  });
  it('keeps one decimal when a shortfall would round up to 100%', () => {
    expect(fmtPct(99.6)).toBe('99.6%');
    expect(fmtPct(100)).toBe('100%');
  });
});

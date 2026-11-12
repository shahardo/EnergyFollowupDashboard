import { describe, expect, it } from 'vitest';
import { escapeHtml, fmtPct, ltr } from './format';

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

describe('text helpers', () => {
  it('ltr wraps in an LTR isolate', () => {
    expect(ltr('5 GW')).toBe('⁦5 GW⁩');
  });
  it('escapeHtml neutralises markup', () => {
    expect(escapeHtml('<img src=x onerror="a()">&\'')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  });
});

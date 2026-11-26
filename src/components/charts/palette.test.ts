import { describe, expect, it } from 'vitest';
import { categoryColors, shadesOf } from './palette';
import { catalog } from '../../data/catalog';

describe('shadesOf', () => {
  it('gives n distinct hex shades, dark to light', () => {
    const s = shadesOf('#e8590c', 4);
    expect(s).toHaveLength(4);
    expect(new Set(s).size).toBe(4);
    for (const c of s) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    const lum = (c: string) => [1, 3, 5].reduce((a, i) => a + parseInt(c.slice(i, i + 2), 16), 0);
    for (let i = 1; i < s.length; i++) expect(lum(s[i])).toBeGreaterThan(lum(s[i - 1]));
  });
  it('returns the colour itself for one shade or a non-hex colour', () => {
    expect(shadesOf('#e8590c', 1)).toEqual(['#e8590c']);
    expect(shadesOf('red', 2)).toEqual(['red', 'red']);
  });
  it('every supply category has a colour', () => {
    for (const k of catalog.sourceCategories) expect(categoryColors[k], k).toBeDefined();
  });
});

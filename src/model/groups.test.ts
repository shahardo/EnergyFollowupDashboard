import { describe, expect, it } from 'vitest';
import { flattenGroups, groupBy, groupTotal, isExpandable, type SeriesGroup } from './groups';

const shade = (c: string, n: number) => Array.from({ length: n }, (_, i) => `${c}-${i}`);
const g: SeriesGroup = {
  key: 'sector:residential',
  name: 'ביתי',
  color: 'orange',
  children: [
    { key: 'e', name: 'ביתי חשמל', values: [1, 2] },
    { key: 'f', name: 'ביתי דלקים', values: [3, 4] },
    { key: 'z', name: 'אפס', values: [0, 0] },
  ],
};

describe('groups', () => {
  it('sums a group', () => expect(groupTotal(g)).toEqual([4, 6]));
  it('draws a collapsed group as one band in its colour', () => {
    expect(flattenGroups([g], new Set(), shade)).toEqual([{ name: 'ביתי', color: 'orange', values: [4, 6] }]);
  });
  it('draws an expanded group as its non-zero items in shades', () => {
    expect(flattenGroups([g], new Set([g.key]), shade)).toEqual([
      { name: 'ביתי חשמל', color: 'orange-0', values: [1, 2] },
      { name: 'ביתי דלקים', color: 'orange-1', values: [3, 4] },
    ]);
  });
  it('passes a single item through and drops empty groups', () => {
    const one: SeriesGroup = { key: 'k', name: 'G', color: 'c', children: [{ key: 'a', name: 'A', values: [1] }] };
    const empty: SeriesGroup = { key: 'e', name: 'E', color: 'c', children: [{ key: 'a', name: 'A', values: [0] }] };
    expect(flattenGroups([one, empty], new Set(), shade)).toEqual([{ name: 'G', color: 'c', values: [1] }]);
    expect(isExpandable(one)).toBe(false);
    expect(isExpandable(g)).toBe(true);
  });
  it('groups items in the given order', () => {
    const items = [
      { key: 'a', name: 'A', values: [1] },
      { key: 'b', name: 'B', values: [2] },
      { key: 'c', name: 'C', values: [3] },
    ];
    const out = groupBy(items, (x) => (x.key === 'b' ? 'y' : 'x'), (id) => ({ name: id, color: id }), 'cat:', ['y', 'x', 'w']);
    expect(out.map((o) => [o.key, o.children.map((c) => c.key)])).toEqual([
      ['cat:y', ['b']],
      ['cat:x', ['a', 'c']],
    ]);
  });
});

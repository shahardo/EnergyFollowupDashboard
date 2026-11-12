import { describe, expect, it } from 'vitest';
import { mergeByBaseline } from './mergeByBaseline';

describe('mergeByBaseline', () => {
  const base = [
    { key: 'a', v: 0 },
    { key: 'b', v: 0 },
    { key: 'c', v: 0 },
  ];

  it('returns the same array when nothing is missing', () => {
    const items = [
      { key: 'c', v: 1 },
      { key: 'a', v: 1 },
      { key: 'b', v: 1 },
    ];
    expect(mergeByBaseline(items, base)).toBe(items);
  });

  it('adds missing items as copies, in baseline order, unknown keys last', () => {
    const items = [
      { key: 'x', v: 9 },
      { key: 'c', v: 1 },
    ];
    const out = mergeByBaseline(items, base);
    expect(out.map((x) => x.key)).toEqual(['a', 'b', 'c', 'x']);
    expect(out[2].v).toBe(1);
    expect(out[0]).not.toBe(base[0]);
  });
});

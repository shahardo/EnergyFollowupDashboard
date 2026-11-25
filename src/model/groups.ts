/**
 * Two detail levels for the stacked charts: a group (a main demand sector, a supply category, a carrier) is drawn as
 * one band, or, when expanded, as its items in shades of the group's colour. Pure: no React, no stores.
 */

/** One item of a group: a band of the chart when the group is expanded. */
export interface GroupLeaf {
  key: string;
  name: string;
  values: number[];
  /** Its own colour; by default a shade of the group's colour. */
  color?: string;
}

/** A group of chart bands. `key` is namespaced (`sector:…`, `dcarrier:…`, `cat:…`, `scarrier:…`). */
export interface SeriesGroup {
  key: string;
  name: string;
  color: string;
  children: GroupLeaf[];
}

/** A band of a stacked chart. */
export interface GroupBand {
  name: string;
  color: string;
  values: number[];
}

/** The group's per-year total (the sum of its items). */
export function groupTotal(g: SeriesGroup, length = g.children[0]?.values.length ?? 0): number[] {
  const out = new Array<number>(length).fill(0);
  for (const c of g.children) c.values.forEach((v, i) => (out[i] += v ?? 0));
  return out;
}

/** Whether a band is worth drawing (not all zero). */
const nonZero = (values: number[]) => values.some((v) => Math.abs(v) > 1e-9);

/** A group's items that aren't all zero. */
export const liveChildren = (g: SeriesGroup) => g.children.filter((c) => nonZero(c.values));

/** Whether a group can be expanded: it has at least two items that aren't all zero. */
export const isExpandable = (g: SeriesGroup) => liveChildren(g).length > 1;

/**
 * The colours of a group's items: their own colour if set, else `shade(groupColor, n)[i]`. A single item takes the
 * group's colour.
 */
export function leafColors(g: SeriesGroup, shade: (color: string, n: number) => string[]): string[] {
  const live = liveChildren(g);
  const shades = live.length > 1 ? shade(g.color, live.length) : [g.color];
  const byKey = new Map(live.map((c, i) => [c.key, c.color ?? shades[i]]));
  return g.children.map((c) => byKey.get(c.key) ?? g.color);
}

/**
 * The chart bands: a collapsed group is one band (its total, the group's colour, the group's name); an expanded one is
 * its non-zero items, in shades of its colour. A group with a single non-zero item is drawn as one band under the
 * group's name either way. All-zero groups are dropped.
 */
export function flattenGroups(
  groups: SeriesGroup[],
  expanded: ReadonlySet<string>,
  shade: (color: string, n: number) => string[],
): GroupBand[] {
  return groups.flatMap((g) => {
    const live = liveChildren(g);
    if (!live.length) return [];
    if (live.length === 1) return [{ name: g.name, color: live[0].color ?? g.color, values: live[0].values }];
    if (!expanded.has(g.key)) return [{ name: g.name, color: g.color, values: groupTotal(g) }];
    const colors = leafColors(g, shade);
    return g.children
      .map((c, i) => ({ name: c.name, color: colors[i], values: c.values }))
      .filter((b) => nonZero(b.values));
  });
}

/**
 * Groups keyed items by a grouping function, keeping the first-seen order of groups (or the given `order`) and of
 * items within each group. `meta(groupId)` gives the group's name and colour; the group's key is `prefix + groupId`.
 */
export function groupBy<T extends GroupLeaf>(
  items: T[],
  groupOf: (item: T) => string,
  meta: (groupId: string, items: T[]) => { name: string; color: string },
  prefix: string,
  order?: string[],
): SeriesGroup[] {
  const byGroup = new Map<string, T[]>();
  for (const id of order ?? []) byGroup.set(id, []);
  for (const it of items) {
    const id = groupOf(it);
    if (!byGroup.has(id)) byGroup.set(id, []);
    byGroup.get(id)!.push(it);
  }
  return [...byGroup.entries()]
    .filter(([, xs]) => xs.length)
    .map(([id, xs]) => ({ key: prefix + id, ...meta(id, xs), children: xs }));
}

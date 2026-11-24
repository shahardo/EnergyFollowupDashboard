import { catalog, categoryOf, sourceCategories } from '../../data/catalog';
import { he } from '../../i18n/he';
import { groupBy, type GroupLeaf, type SeriesGroup } from '../../model/groups';
import { carrierColors, categoryColors, colorFor, sourceColors } from '../charts/palette';

/** The number of catalogue sources in each category. */
const categorySize = new Map(sourceCategories.map((c) => [c.key, c.sources.length]));

/** A category's name and colour: a one-source category (coal, wind…) keeps the source's own name and colour. */
function categoryMeta(id: string, items: GroupLeaf[]) {
  const single = (categorySize.get(id) ?? 1) === 1 || items.length === 1;
  return {
    name: single && items.length === 1 ? items[0].name : (he.groups.categories[id] ?? items[0].name),
    color: single && items.length === 1 ? (items[0].color ?? colorFor(sourceColors, items[0].key, 0)) : (categoryColors[id] ?? colorFor(sourceColors, items[0].key, 0)),
  };
}

/**
 * Supply bands keyed by source → one group per supply category (`cat:<category>`), in catalogue category order.
 * Items keep no colour of their own, so an expanded category is drawn in shades of its colour; a band whose key isn't
 * a catalogue source (e.g. `_finalUse`) is its own one-item group.
 */
export function sourceCategoryGroups(bands: GroupLeaf[]): SeriesGroup[] {
  return groupBy(
    bands.map(({ key, name, values }) => ({ key, name, values })),
    (b) => categoryOf(b.key),
    (id, items) => categoryMeta(id, items.map((it) => ({ ...it, color: bands.find((b) => b.key === it.key)?.color }))),
    'cat:',
    catalog.sourceCategories,
  );
}

/** Per-year totals of the bands in each category, as items (the electricity group's items in the carriers view). */
export function categoryTotals(bands: GroupLeaf[]): GroupLeaf[] {
  return sourceCategoryGroups(bands).map((g) => ({
    key: g.key,
    name: g.name,
    values: g.children.reduce<number[]>(
      (acc, c) => acc.map((v, i) => v + (c.values[i] ?? 0)),
      new Array<number>(g.children[0]?.values.length ?? 0).fill(0),
    ),
  }));
}

/**
 * The supply chart's groups in the final-energy view (`scarrier:<c>`): electricity (its items = the supply categories),
 * fuels (clean / hydrogen / fossil imports) and direct gas. Empty carriers are dropped by `flattenGroups`.
 */
export function supplyCarrierGroups(electric: GroupLeaf[], fuels: GroupLeaf[], gas: GroupLeaf[] = []): SeriesGroup[] {
  const c = he.groups.supplyCarriers;
  const strip = (xs: GroupLeaf[]) => xs.map(({ key, name, values }) => ({ key, name, values }));
  return [
    { key: 'scarrier:electricity', name: c.electricity, color: carrierColors.electricity, children: categoryTotals(electric) },
    { key: 'scarrier:fuels', name: c.fuels, color: carrierColors.fuels, children: strip(fuels) },
    { key: 'scarrier:gas', name: c.gas, color: carrierColors.gas, children: strip(gas) },
  ];
}

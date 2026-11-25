import { topSectorOf } from '../../data/catalog';
import { hasNonElectric, type NonElectricPoint } from '../../model/carriers';
import type { DemandPoint, SubSectorPoint } from '../../model/demand';
import type { GroupLeaf, SeriesGroup } from '../../model/groups';
import type { DemandScenario } from '../../schema';
import { carrierColors, colorFor, sectorColors } from '../charts/palette';

/** The labels the demand groups need (from `he`). */
export interface DemandGroupLabels {
  carriers: { electricity: string; fuels: string; gas: string };
  carrierShort: { electricity: string; fuels: string; gas: string };
  sectorCarrier: (sector: string, carrier: string) => string;
  transportFuels: string;
}

interface Args {
  view: 'sectors' | 'carriers';
  scenario: DemandScenario;
  years: number[];
  demandPoints: DemandPoint[];
  subPoints: SubSectorPoint[];
  nePoints: NonElectricPoint[];
  /** Include fuels and direct gas (final-energy scope). */
  withFuels: boolean;
  /** A demand point → its display value (energy × factor, or peak in GW). */
  elecValue: (p: { energy: number; peak: number }) => number;
  /** J → display unit, for fuels and gas. */
  factor: number;
  labels: DemandGroupLabels;
}

/** The top-level sectors of a scenario (no catalogue parent), each with its members (itself first, then its split children). */
export function topSectors(scenario: DemandScenario) {
  return scenario.sectors
    .filter((s) => topSectorOf(s.key) === s.key)
    .map((top) => ({ top, members: scenario.sectors.filter((s) => topSectorOf(s.key) === top.key) }));
}

/**
 * The demand chart's groups. Sectors view: one group per main sector (`sector:<key>`), its items being the sector's
 * electricity (or, for transport, each sub-sector's), fuels and gas, and each split child (heat) as one item.
 * Carriers view: electricity / fuels / gas (`dcarrier:<c>`), its items being each main sector's share.
 */
export function demandGroups(a: Args): SeriesGroup[] {
  const { scenario, years, withFuels, factor, labels } = a;
  const idx = new Map(years.map((y, i) => [y, i]));
  const series = () => new Array<number>(years.length).fill(0);
  const elec = new Map<string, number[]>();
  for (const p of a.demandPoints) {
    const i = idx.get(p.year);
    if (i === undefined) continue;
    if (!elec.has(p.sector)) elec.set(p.sector, series());
    elec.get(p.sector)![i] += a.elecValue(p);
  }
  const fuels = new Map<string, number[]>();
  const gas = new Map<string, number[]>();
  for (const p of a.nePoints) {
    const i = idx.get(p.year);
    if (i === undefined) continue;
    if (!fuels.has(p.sector)) {
      fuels.set(p.sector, series());
      gas.set(p.sector, series());
    }
    fuels.get(p.sector)![i] += p.fuels * factor;
    gas.get(p.sector)![i] += p.gas * factor;
  }
  const of = (m: Map<string, number[]>, key: string) => m.get(key) ?? series();
  const zero = series();
  const fuelOf = (key: string) => (withFuels ? of(fuels, key) : zero);
  const gasOf = (key: string) => (withFuels ? of(gas, key) : zero);
  const add = (...xs: number[][]) => xs.reduce((acc, x) => acc.map((v, i) => v + x[i]), series());
  const tops = topSectors(scenario);

  if (a.view === 'carriers') {
    const carrier = (c: 'electricity' | 'fuels' | 'gas', value: (key: string) => number[]): SeriesGroup => ({
      key: `dcarrier:${c}`,
      name: labels.carriers[c],
      color: carrierColors[c],
      children: tops.map(({ top, members }) => ({
        key: top.key,
        name: top.label,
        values: add(...members.map((m) => value(m.key))),
      })),
    });
    const out = [carrier('electricity', (k) => of(elec, k))];
    if (withFuels) out.push(carrier('fuels', fuelOf), carrier('gas', gasOf));
    return out;
  }

  return tops.map(({ top, members }, i) => {
    const color = colorFor(sectorColors, top.key, i);
    const children: GroupLeaf[] = [];
    if (top.subSectors?.length) {
      for (const sub of top.subSectors) {
        const v = series();
        for (const p of a.subPoints) {
          if (p.subSector === sub.key && idx.has(p.year)) v[idx.get(p.year)!] += a.elecValue(p);
        }
        children.push({ key: sub.key, name: sub.label, values: v });
      }
      children.push({ key: `${top.key}-fuels`, name: labels.transportFuels, values: add(fuelOf(top.key), gasOf(top.key)) });
    } else {
      const own = (c: 'electricity' | 'fuels' | 'gas') => labels.sectorCarrier(top.label, labels.carrierShort[c]);
      children.push({ key: `${top.key}-elec`, name: own('electricity'), values: of(elec, top.key) });
      children.push({ key: `${top.key}-fuels`, name: own('fuels'), values: fuelOf(top.key) });
      children.push({ key: `${top.key}-gas`, name: own('gas'), values: gasOf(top.key) });
    }
    for (const m of members.slice(1)) {
      children.push({ key: m.key, name: m.label, values: add(of(elec, m.key), fuelOf(m.key), gasOf(m.key)) });
    }
    return { key: `sector:${top.key}`, name: top.label, color, children };
  });
}

/** Whether a main sector has more than one panel row (its electricity, fuels-and-gas or split-child rows). */
export const isMultiRowSector = (members: DemandScenario['sectors']) =>
  members.length > 1 || members.some((s) => hasNonElectric(s));

/**
 * The expand keys of the demand panel's groups that have a handle, in panel order: the multi-row main sectors in the
 * sectors view; electricity, fuels and (when more than one main sector uses it) gas in the carriers view.
 */
export function demandGroupKeys(scenario: DemandScenario, view: 'sectors' | 'carriers'): string[] {
  const tops = topSectors(scenario);
  if (view === 'sectors') return tops.filter((t) => isMultiRowSector(t.members)).map((t) => `sector:${t.top.key}`);
  const withGas = tops.filter((t) => t.members.some((s) => (s.nonElectric?.gas ?? 0) > 0)).length;
  return ['dcarrier:electricity', 'dcarrier:fuels', ...(withGas > 1 ? ['dcarrier:gas'] : [])];
}

import { Checkbox, Stack } from '@mantine/core';
import { useMemo, type ReactNode } from 'react';
import { supplyPresets } from '../../data/baseline';
import { catalog, categoryOf } from '../../data/catalog';
import { he } from '../../i18n/he';
import { round2 } from '../../model/math';
import { centeredRange } from '../../model/sliderRange';
import { interpolateCapacity, SCALE_FROM_YEAR, scaleCapacityFrom, sourceCapacity, sourceEnergy } from '../../model/supply';
import { fromGW, toGW, toTWh } from '../../model/units';
import type { SupplySource } from '../../schema';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore, type SupplyView } from '../../store/uiStore';
import { fmt } from '../../utils/format';
import { carrierColors, categoryColors, colorFor, shadesOf, sourceColors } from '../charts/palette';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { DisclosureHandle } from '../controls/Disclosure';
import { GroupCell, SummaryRow } from '../controls/GroupCell';
import { SourceDetails } from '../controls/SourceDetails';

interface Props {
  view: SupplyView;
  baseYear: number;
  horizonYear: number;
}

/**
 * The supply parameter panel, in two detail levels. Sources view: one row per supply category (gas, solar, storage,
 * hydrogen…) with a triangle handle and an "enable all" checkbox; its slider sets the category's installed GW at the
 * horizon year by scaling every enabled source in it by the same factor. Expanded: each source's own row (as before).
 * A one-source category is just that source's row. Each category is one full-width row; its sources open below it
 * in two columns. Final-energy view: electricity (all power sources, expanding into
 * the categories) and summary rows for fuels and direct gas, whose mix is set on the scenario-planning tab.
 */
export function SupplyParams({ view, baseYear, horizonYear }: Props) {
  const scenario = useSupplyStore((s) => s.scenario);
  const updateSource = useSupplyStore((s) => s.updateSource);
  const updateSources = useSupplyStore((s) => s.updateSources);
  const active = useSupplyStore((s) => s.active);
  const demandPreset = useSupplyStore((s) => s.demandPreset);
  const expanded = useUiStore((s) => s.expanded);
  const toggle = useUiStore((s) => s.toggleExpanded);
  const gear = useSingleGear();
  const t = he.plan;
  const g = he.groups;
  const open = useMemo(() => new Set(expanded), [expanded]);
  const presetBase = supplyPresets[demandPreset][active];

  /** The scenario's sources by category, in catalogue category order (unknown keys last, each on its own). */
  const categories = useMemo(() => {
    const order = [...catalog.sourceCategories];
    const by = new Map<string, SupplySource[]>(order.map((c) => [c, []]));
    for (const s of scenario.sources) {
      const c = categoryOf(s.key);
      if (!by.has(c)) by.set(c, []);
      by.get(c)!.push(s);
    }
    return [...by.entries()].filter(([, xs]) => xs.length).map(([key, sources]) => ({ key, sources }));
  }, [scenario.sources]);

  const retired = (s: SupplySource) => s.retireYear !== undefined && horizonYear >= s.retireYear;
  const gwAt = (s: Pick<SupplySource, 'capacity'>) => toGW(interpolateCapacity(s.capacity, horizonYear));
  const twhAt = (s: SupplySource) => toTWh(sourceEnergy(sourceCapacity(s, horizonYear), s.capacityFactor));
  const live = (xs: SupplySource[]) => xs.filter((s) => s.enabled && !retired(s));

  /** One source's row (as before the grouping): enable checkbox, horizon-GW slider, details behind ⚙. */
  const sourceRow = (s: SupplySource, color: string, handle?: ReactNode) => {
    const value = gwAt(s);
    const baseSrc = presetBase.sources.find((b) => b.key === s.key);
    const base = baseSrc ? gwAt(baseSrc) : value;
    const isRetired = retired(s);
    return (
      <CenteredSlider
        key={s.key}
        leading={
          <>
            {handle}
            <Checkbox
              size="xs"
              checked={s.enabled}
              aria-label={t.enable(s.label)}
              onChange={(e) => updateSource(s.key, { enabled: e.currentTarget.checked })}
            />
          </>
        }
        label={s.label}
        color={color}
        value={value}
        range={centeredRange(base, 5, 0)}
        disabled={!s.enabled || isRetired}
        onChange={(v) =>
          updateSource(s.key, {
            capacity: scaleCapacityFrom(s.capacity, SCALE_FROM_YEAR, horizonYear, fromGW(round2(v))),
          })
        }
        thumbLabel={t.capacityThumb(s.label, horizonYear)}
        formatValue={(v) => `${v.toFixed(1)} GW`}
        sideValue={isRetired ? t.retiredIn(s.retireYear!) : `${fmt(twhAt(s), 0)} TWh`}
        sideNote={isRetired ? undefined : `${fmt(value, 1)} GW`}
        gear={gear(s.key, t.details(s.label))}
      >
        <SourceDetails
          source={s}
          color={color}
          minYear={baseYear}
          maxYear={horizonYear}
          onChange={(patch) => updateSource(s.key, patch)}
        />
      </CenteredSlider>
    );
  };

  /** A group row: handle, "enable all" checkbox, and a slider that scales every enabled source's horizon GW. */
  const groupRow = (key: string, label: string, color: string, sources: SupplySource[]) => {
    const on = live(sources);
    const value = on.reduce((a, s) => a + gwAt(s), 0);
    const base = on.reduce((a, s) => {
      const b = presetBase.sources.find((x) => x.key === s.key);
      return a + (b ? gwAt(b) : gwAt(s));
    }, 0);
    const enabled = sources.filter((s) => s.enabled).length;
    const scale = (v: number) => {
      if (value <= 0) return;
      const k = v / value;
      updateSources(
        Object.fromEntries(
          on.map((s) => [
            s.key,
            { capacity: scaleCapacityFrom(s.capacity, SCALE_FROM_YEAR, horizonYear, fromGW(round2(gwAt(s) * k))) },
          ]),
        ),
      );
    };
    return (
      <CenteredSlider
        key={key}
        leading={
          <>
            <DisclosureHandle opened={open.has(key)} onToggle={() => toggle(key)} label={g.expand(label)} />
            <Checkbox
              size="xs"
              checked={enabled === sources.length}
              indeterminate={enabled > 0 && enabled < sources.length}
              aria-label={g.enableAll(label)}
              onChange={(e) => {
                const next = e.currentTarget.checked;
                updateSources(Object.fromEntries(sources.map((s) => [s.key, { enabled: next }])));
              }}
            />
          </>
        }
        label={label}
        color={color}
        value={value}
        range={centeredRange(base, 5, 0)}
        disabled={value <= 0}
        onChange={scale}
        thumbLabel={g.capacityThumb(label, horizonYear)}
        formatValue={(v) => `${v.toFixed(1)} GW`}
        sideValue={`${fmt(on.reduce((a, s) => a + twhAt(s), 0), 0)} TWh`}
        sideNote={`${fmt(value, 1)} GW`}
      />
    );
  };

  const spacer = <DisclosureHandle opened={false} onToggle={() => {}} label="" expandable={false} />;

  /** One category: a plain source row when it has one source, else a group row with its sources below. */
  const categoryCell = ({ key, sources }: { key: string; sources: SupplySource[] }) => {
    if (sources.length === 1) {
      const s = sources[0];
      return <div key={key}>{sourceRow(s, colorFor(sourceColors, s.key, scenario.sources.indexOf(s)), spacer)}</div>;
    }
    const gkey = `cat:${key}`;
    const color = categoryColors[key] ?? colorFor(sourceColors, sources[0].key, 0);
    const shades = shadesOf(color, sources.length);
    return (
      <GroupCell key={gkey} opened={open.has(gkey)} head={groupRow(gkey, g.categories[key] ?? key, color, sources)}>
        {sources.map((s, i) => sourceRow(s, shades[i]))}
      </GroupCell>
    );
  };

  if (view === 'sources') {
    return (
      <Stack gap={0}>{categories.map(categoryCell)}</Stack>
    );
  }

  // Final-energy view: electricity → categories → sources; fuels and direct gas are set on the scenario-planning tab.
  const ekey = 'scarrier:electricity';
  const c = g.supplyCarriers;
  return (
    <Stack gap={0}>
      <GroupCell
        opened={open.has(ekey)}
        columns={1}
        head={groupRow(ekey, c.electricity, carrierColors.electricity, scenario.sources)}
      >
        {categories.map(categoryCell)}
      </GroupCell>
      <SummaryRow leading={spacer} color={carrierColors.fuels} label={c.fuels} note={g.mixElsewhere} />
      <SummaryRow leading={spacer} color={carrierColors.gas} label={c.gas} note={g.mixElsewhere} />
    </Stack>
  );
}

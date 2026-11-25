import { Stack } from '@mantine/core';
import { useMemo, type ReactNode } from 'react';
import { demandPresets } from '../../data/baseline';
import { he } from '../../i18n/he';
import { hasNonElectric } from '../../model/carriers';
import { sectorTotalEnergy } from '../../model/demand';
import { centeredRange } from '../../model/sliderRange';
import { fromPct, toPct, toTWh } from '../../model/units';
import type { SectorDemand } from '../../schema';
import { useDemandStore } from '../../store/demandStore';
import { useNonElectric } from '../../store/usePlanSeries';
import { useSeries } from '../../store/useSeries';
import { useUiStore, type PlanView } from '../../store/uiStore';
import { fmt } from '../../utils/format';
import { carrierColors, colorFor, sectorColors, shadesOf } from '../charts/palette';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { DisclosureHandle } from '../controls/Disclosure';
import { GroupCell, HalfRow, SummaryRow } from '../controls/GroupCell';
import { SectorDetails } from '../controls/SectorDetails';
import { topSectors } from './demandGroups';

/** One growth rate a group slider moves: a sector's electricity rate or its fuels-and-gas rate. */
interface Member {
  key: string;
  field: 'elec' | 'ne';
}

/** Signed difference (+ / − / none), no decimal digits. */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 0)}`;
/** Rounds a percentage to 0.01. */
const round2 = (pct: number) => Math.round(pct * 100) / 100;
/** The growth rate (fraction) of a member. */
const rateOf = (s: SectorDemand | undefined, field: Member['field']) =>
  (field === 'elec' ? s?.growthRate : s?.nonElectric?.growthRate) ?? 0;

/**
 * The demand parameter panel, in two detail levels. Sectors view: one row per main sector (residential, commercial,
 * industry, transport…) with a triangle handle; expanded, its electricity, fuels-and-gas and split-off (heat) rows.
 * Carriers view: electricity / fuels / gas, expanded into each main sector's share. A group row's slider shifts every
 * growth rate in the group by the same number of percentage points (individual edits are kept); its centre is the
 * active preset. Each group is one full-width row; its items open below it in two columns. Gas has no slider of its own: it grows with the fuels. The expand state is shared with the chart.
 */
export function DemandParams({ view }: { view: PlanView }) {
  const scenario = useDemandStore((s) => s.scenario);
  const updateSector = useDemandStore((s) => s.updateSector);
  const updateSectors = useDemandStore((s) => s.updateSectors);
  const active = useDemandStore((s) => s.active);
  const expanded = useUiStore((s) => s.expanded);
  const toggle = useUiStore((s) => s.toggleExpanded);
  const { demandPoints } = useSeries();
  const nePoints = useNonElectric();
  const gear = useSingleGear();
  const t = he.plan;
  const g = he.groups;
  const presetBase = demandPresets[active];
  const { baseYear, horizonYear } = scenario;
  const open = useMemo(() => new Set(expanded), [expanded]);
  const byKey = useMemo(() => new Map(scenario.sectors.map((s) => [s.key, s])), [scenario.sectors]);
  const baseByKey = useMemo(() => new Map(presetBase.sectors.map((s) => [s.key, s])), [presetBase]);
  const tops = useMemo(() => topSectors(scenario), [scenario]);

  // ── Horizon-year values (TWh) per sector and carrier ──
  const at = useMemo(() => {
    const elec = new Map<string, number>();
    const fuels = new Map<string, number>();
    const gas = new Map<string, number>();
    for (const p of demandPoints) if (p.year === horizonYear) elec.set(p.sector, toTWh(p.energy));
    for (const p of nePoints) {
      if (p.year !== horizonYear) continue;
      fuels.set(p.sector, toTWh(p.fuels));
      gas.set(p.sector, toTWh(p.gas));
    }
    return { elec, fuels, gas };
  }, [demandPoints, nePoints, horizonYear]);
  // In the carriers view a fuels row shows the fuels alone (gas has its own group); in the sectors view fuels + gas.
  const twhOf = (m: Member) =>
    m.field === 'elec'
      ? (at.elec.get(m.key) ?? 0)
      : (at.fuels.get(m.key) ?? 0) + (view === 'sectors' ? (at.gas.get(m.key) ?? 0) : 0);
  const sumTwh = (members: Member[]) => members.reduce((a, m) => a + twhOf(m), 0);

  // ── Group slider: the mean shift (percentage points) vs. the preset, added to every member ──
  const shiftOf = (members: Member[]) =>
    members.length
      ? members.reduce((a, m) => a + toPct(rateOf(byKey.get(m.key), m.field) - rateOf(baseByKey.get(m.key), m.field)), 0) /
        members.length
      : 0;
  const setShift = (members: Member[], value: number) => {
    const diff = value - shiftOf(members);
    const patches: Record<string, Partial<SectorDemand>> = {};
    for (const m of members) {
      const s = byKey.get(m.key)!;
      const next = fromPct(round2(toPct(rateOf(s, m.field)) + diff));
      if (m.field === 'elec') patches[m.key] = { ...patches[m.key], growthRate: next };
      else patches[m.key] = { ...patches[m.key], nonElectric: { ...s.nonElectric!, growthRate: next } };
    }
    updateSectors(patches);
  };
  const groupSlider = (key: string, label: string, color: string, members: Member[], expandable: boolean) => (
    <CenteredSlider
      key={key}
      leading={<DisclosureHandle opened={open.has(key)} onToggle={() => toggle(key)} label={g.expand(label)} expandable={expandable} />}
      label={label}
      color={color}
      value={shiftOf(members)}
      range={centeredRange(0, 3)}
      onChange={(v) => setShift(members, v)}
      thumbLabel={g.growthShiftThumb(label)}
      formatValue={(v) => g.pp(`${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`)}
      sideValue={`${fmt(sumTwh(members), 0)} TWh`}
      sideNote={g.vsPreset}
    />
  );

  // ── A single sector's sliders (as before the grouping) ──
  const elecSlider = (s: SectorDemand, label: string, color: string, leading?: ReactNode) => {
    const baseRate = baseByKey.get(s.key)?.growthRate ?? s.growthRate;
    const twh = at.elec.get(s.key) ?? 0;
    const delta = twh - toTWh(sectorTotalEnergy({ ...s, growthRate: baseRate }, horizonYear, baseYear, horizonYear));
    return (
      <CenteredSlider
        key={s.key}
        leading={leading}
        label={label}
        color={color}
        value={toPct(s.growthRate)}
        range={centeredRange(toPct(baseRate), 3)}
        onChange={(pct) => updateSector(s.key, { growthRate: fromPct(round2(pct)) })}
        thumbLabel={t.growthThumb(label)}
        formatValue={(v) => `${v.toFixed(1)}%`}
        sideValue={`${fmt(twh, 0)} TWh`}
        sideNote={Math.abs(delta) < 0.5 ? t.base : t.vsBase(signed(delta))}
        gear={gear(s.key, t.details(s.label))}
      >
        <SectorDetails
          sector={s}
          baseYear={baseYear}
          horizonYear={horizonYear}
          onChange={(patch) => updateSector(s.key, patch)}
        />
      </CenteredSlider>
    );
  };
  const neSlider = (s: SectorDemand, label: string, color: string) => {
    const neBaseRate = baseByKey.get(s.key)?.nonElectric?.growthRate ?? s.nonElectric!.growthRate;
    return (
      <CenteredSlider
        key={`${s.key}-ne`}
        label={label}
        color={color}
        value={toPct(s.nonElectric!.growthRate)}
        range={centeredRange(toPct(neBaseRate), 3)}
        onChange={(pct) =>
          updateSector(s.key, { nonElectric: { ...s.nonElectric!, growthRate: fromPct(round2(pct)) } })
        }
        thumbLabel={t.nonElecGrowthThumb(s.label)}
        formatValue={(v) => `${v.toFixed(1)}%`}
        sideValue={`${fmt(twhOf({ key: s.key, field: 'ne' }), 0)} TWh`}
      />
    );
  };
  const spacer = <DisclosureHandle opened={false} onToggle={() => {}} label="" expandable={false} />;

  let cells: ReactNode[];
  if (view === 'sectors') {
    cells = tops.map(({ top, members }, i) => {
      const color = colorFor(sectorColors, top.key, i);
      const key = `sector:${top.key}`;
      const rows: { member: Member; s: SectorDemand; label: string }[] = members.flatMap((s, k) => {
        const own = k === 0;
        const elecLabel = own && hasNonElectric(s) ? g.sectorCarrier(s.label, g.carrierShort.electricity) : s.label;
        const out: { member: Member; s: SectorDemand; label: string }[] = [
          { member: { key: s.key, field: 'elec' }, s, label: elecLabel },
        ];
        if (hasNonElectric(s)) out.push({ member: { key: s.key, field: 'ne' }, s, label: t.nonElecLabel(s.label) });
        return out;
      });
      if (rows.length === 1) return <HalfRow key={key}>{elecSlider(top, top.label, color, spacer)}</HalfRow>;
      const shades = shadesOf(color, rows.length);
      return (
        <GroupCell
          key={key}
          opened={open.has(key)}
          head={groupSlider(key, top.label, color, rows.map((r) => r.member), true)}
        >
          {rows.map((r, k) =>
            r.member.field === 'elec' ? elecSlider(r.s, r.label, shades[k]) : neSlider(r.s, r.label, shades[k]),
          )}
        </GroupCell>
      );
    });
  } else {
    // Carriers view: each carrier's rows are the main sectors' shares of it.
    const carrierCell = (c: 'electricity' | 'fuels', field: Member['field']) => {
      const key = `dcarrier:${c}`;
      const color = carrierColors[c];
      const parts = tops
        .map(({ top, members }) => ({
          top,
          members: members.filter((s) => field === 'elec' || hasNonElectric(s)).map((s) => ({ key: s.key, field })),
        }))
        .filter((p) => p.members.length);
      const shades = shadesOf(color, parts.length);
      return (
        <GroupCell
          key={key}
          opened={open.has(key)}
          head={groupSlider(key, he.plan.carriers[c], color, parts.flatMap((p) => p.members), parts.length > 1)}
        >
          {parts.map((p, k) => {
            if (p.members.length > 1) return groupSlider(`${key}:${p.top.key}`, p.top.label, shades[k], p.members, false);
            const s = byKey.get(p.members[0].key)!;
            return field === 'elec' ? elecSlider(s, s.label, shades[k]) : neSlider(s, s.label, shades[k]);
          })}
        </GroupCell>
      );
    };
    const gasKey = 'dcarrier:gas';
    const gasParts = tops
      .map(({ top, members }) => ({ top, twh: members.reduce((a, s) => a + (at.gas.get(s.key) ?? 0), 0) }))
      .filter((p) => p.twh > 0.005);
    const gasShades = shadesOf(carrierColors.gas, gasParts.length);
    const gasTotal = gasParts.reduce((a, p) => a + p.twh, 0);
    cells = [carrierCell('electricity', 'elec'), carrierCell('fuels', 'ne')];
    if (gasParts.length) {
      cells.push(
        <GroupCell
          key={gasKey}
          opened={open.has(gasKey)}
          head={
            <SummaryRow
              leading={
                <DisclosureHandle
                  opened={open.has(gasKey)}
                  onToggle={() => toggle(gasKey)}
                  label={g.expand(he.plan.carriers.gas)}
                  expandable={gasParts.length > 1}
                />
              }
              color={carrierColors.gas}
              label={he.plan.carriers.gas}
              note={g.gasFollowsFuels}
              side={`${fmt(gasTotal, 0)} TWh`}
            />
          }
        >
          {gasParts.map((p, k) => (
            <SummaryRow key={p.top.key} color={gasShades[k]} label={p.top.label} side={`${fmt(p.twh, 0)} TWh`} />
          ))}
        </GroupCell>,
      );
    }
  }

  return (
    <Stack gap={0}>{cells}</Stack>
  );
}

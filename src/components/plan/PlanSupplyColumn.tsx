import { Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef, type ReactNode } from 'react';
import { SUPPLY_PRESETS, supplyPresets } from '../../data/baseline';
import { planParamsOf } from '../../data/scenarioPlan';
import { he } from '../../i18n/he';
import { planSupplyCsv } from '../../io/csvExport';
import { FUEL_KEYS } from '../../model/carriers';
import { factorsOf } from '../../model/fuel';
import { flattenGroups } from '../../model/groups';
import { GAS_DIRECT_KEY, isRuleKey, ruleMatches } from '../../model/scenarioPlan';
import { centeredRange, type SliderRange } from '../../model/sliderRange';
import { toGW, toTWh } from '../../model/units';
import { useDemandStore } from '../../store/demandStore';
import { useSupplyStore, type PlanParamGroup } from '../../store/supplyStore';
import type { ScenarioPlanParams } from '../../schema';
import { usePlanSupply } from '../../store/usePlanSeries';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { fmt } from '../../utils/format';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { carrierColors, categoryColors, colorFor, shadesOf, sourceColors, supplyPresetColors } from '../charts/palette';
import { EnergyUnitSelect } from '../charts/EnergyUnitSelect';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { DisclosureHandle } from '../controls/Disclosure';
import { GroupCell } from '../controls/GroupCell';
import { ColorSquare } from '../controls/inputs';
import { ScenarioSelect } from './ScenarioSelect';
import { sourceCategoryGroups, supplyCarrierGroups } from './supplyGroups';
import { ViewSelect } from './ViewSelect';
import { fuelValue, modeNote, supplyValue, unitInfo, useUnitFactor } from './unitSeries';

/** Options for the supply chart's view selector: supply channel (source), or final energy (carriers). */
const SUPPLY_VIEW_OPTIONS = [
  { value: 'sources' as const, label: he.viewBy.channel },
  { value: 'carriers' as const, label: he.viewBy.finalEnergy },
];

/** The fuel (non-electricity) bands of the supply chart. */
const isFuelKey = (key: string) => (FUEL_KEYS as readonly string[]).includes(key) || key === GAS_DIRECT_KEY;

/** The factor from SI to the display unit for each field of the plan rules (W → GW, fraction → %); a field not listed: 1. */
const PARAM_SCALE: Record<string, number> = { slope: toGW(1), rate: toGW(1), step: toGW(1), base: toGW(1), share: 100 };

/** Range for a start year: ±5 years around the default, in 1-year steps. */
const yearRange = (base: number): SliderRange => ({ min: base - 5, max: base + 5, step: 1 });
/** Range for an integer (years, steps) around the default. */
const intRange = (base: number, span: number, min = 0): SliderRange => ({
  min: Math.max(min, base - span),
  max: base + span,
  step: 1,
});

/** One field of a parameter group: name, range and display. */
interface Field {
  field: string;
  label: string;
  range: SliderRange;
  format: (v: number) => string;
}

/**
 * The supply column in the scenario-planning tab: electricity sources by the rules (gas fills the rest) and fuels
 * by the mix (fossil imports fill the rest), in a stacked-area chart against the total demand line; in the
 * energy-source view, also each carrier's bound lines. Below: a slider per rule (slope/rate/share), with the rest
 * of the parameters behind ⚙.
 */
export function PlanSupplyColumn() {
  // The same supply scenario and the same policy menu as in the demand-and-supply tab: the rules write into it.
  const scenario = useSupplyStore((s) => s.scenario);
  const setPlanParam = useSupplyStore((s) => s.setPlanParam);
  const setPlanParams = useSupplyStore((s) => s.setPlanParams);
  const toggleExpanded = useUiStore((s) => s.toggleExpanded);
  const reset = useSupplyStore((s) => s.reset);
  const active = useSupplyStore((s) => s.active);
  const demandPreset = useSupplyStore((s) => s.demandPreset);
  const select = useSupplyStore((s) => s.select);
  const params = planParamsOf(scenario);
  const presetParams = planParamsOf(supplyPresets[demandPreset][active]);
  const baseYear = useDemandStore((s) => s.scenario.baseYear);
  const horizonYear = useDemandStore((s) => s.scenario.horizonYear);
  const scenarioName = useDemandStore((s) => s.scenario.name);
  const targetYear = useUiStore((s) => s.targetYear);
  const units = useUiStore((s) => s.units);
  const energyUnit = useUiStore((s) => s.energyUnit);
  const supplyView = useUiStore((s) => s.supplyView);
  const setSupplyView = useUiStore((s) => s.setSupplyView);
  const detail = useUiStore((s) => s.detail);
  const { years, totals } = useSeries();
  const plan = usePlanSupply();
  const chartRef = useRef<ChartHandle>(null);
  const gear = useSingleGear();
  const t = he.scenarioPlan;
  const c = he.plan.carriers;
  const gw = units === 'gw';
  // TWh/GW ("חשמל") show electricity only; fuels and direct gas go in only in toe/bcm/co2.
  const noFuels = gw || units === 'twh';
  const { unit, digits } = unitInfo(units, energyUnit);
  const factors = useMemo(() => factorsOf(scenario.sources), [scenario.sources]);
  const valueOf = useMemo(() => supplyValue(units, factors, energyUnit), [units, factors, energyUnit]);
  const factor = useUnitFactor(units, plan.electric, years, factors, energyUnit);
  /** The name of an electricity source (from the scenario; a source that's also a fuel band gets "(electricity)") or of a fuel. */
  const sourceLabel = (key: string) => {
    const src = scenario.sources.find((x) => x.key === key)?.label ?? t.sources[key] ?? key;
    return (FUEL_KEYS as readonly string[]).includes(key) ? t.powerLabel(src) : src;
  };
  const fuelLabel = (key: string) => t.sources[key] ?? key;
  const label = (key: string) => (isFuelKey(key) ? fuelLabel(key) : sourceLabel(key));
  const setParam = <G extends PlanParamGroup>(group: G, patch: Partial<ScenarioPlanParams[G]>) =>
    setPlanParam(group, patch, totals);

  // ── Chart series: supply categories + the fuel group, or (final-energy view) carriers; expanded groups in shades ──
  const expanded = useUiStore((st) => st.expanded);
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const stacked = useMemo(
    () => {
      const electric = plan.electricKeys.map((key, i) => ({
        key,
        name: sourceLabel(key),
        color: colorFor(sourceColors, key, i),
        values: plan.electric.filter((p) => p.source === key).map(valueOf),
      }));
      const fuelBand = (key: string) => ({
        key,
        name: fuelLabel(key),
        values: noFuels
          ? years.map(() => 0)
          : plan.fuels.filter((p) => p.source === key).map((p) => fuelValue(units, key, p.energy, energyUnit)),
      });
      const fuels = FUEL_KEYS.map(fuelBand);
      const gas = [fuelBand(GAS_DIRECT_KEY)];
      const groups =
        supplyView === 'carriers'
          ? supplyCarrierGroups(electric, fuels, gas)
          : [
              ...sourceCategoryGroups(electric),
              { key: 'scarrier:fuels', name: he.groups.supplyCarriers.fuels, color: carrierColors.fuels, children: fuels },
              { key: `src:${GAS_DIRECT_KEY}`, name: fuelLabel(GAS_DIRECT_KEY), color: sourceColors.gasDirect, children: gas },
            ];
      return flattenGroups(groups, expandedSet, shadesOf);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, units, energyUnit, scenario.sources, valueOf, supplyView, years, gw, expandedSet],
  );

  // Demand per carrier, cumulative: electricity, electricity + fuels, and total. Fuels are fully supplied, so their demand = their supply.
  const demandLines = useMemo(() => {
    const elec = totals.map((d) => (gw ? toGW(d.peak) : d.energy * factor(d.year)));
    if (noFuels) return { elec, withFuels: elec, total: elec };
    const sum = (keys: string[]) => {
      const out = years.map(() => 0);
      for (const p of plan.fuels) {
        if (keys.includes(p.source)) out[years.indexOf(p.year)] += fuelValue(units, p.source, p.energy, energyUnit);
      }
      return out;
    };
    const fuels = sum([...FUEL_KEYS]);
    const gas = sum([GAS_DIRECT_KEY]);
    const withFuels = elec.map((v, i) => v + fuels[i]);
    return { elec, withFuels, total: withFuels.map((v, i) => v + gas[i]) };
  }, [totals, plan, years, units, energyUnit, gw, noFuels, factor]);

  // Clear bounds per carrier, in both views: electricity, and above it electricity + fuels; the total line is also
  // the gas bound (direct gas is the top band), so gas has no line of its own. A line that coincides with the one
  // below it (e.g. fuels in BCM mode) isn't drawn.
  const carriersShown = !noFuels;
  const line = useMemo(
    () => ({ name: t.totalDemand, values: demandLines.total, tag: carriersShown ? t.tags.total : undefined }),
    [demandLines, t, carriersShown],
  );
  const bounds = useMemo(() => {
    if (!carriersShown) return undefined;
    const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
    const out = [
      { name: t.electricDemand, values: demandLines.elec, color: carrierColors.electricity, tag: t.tags.electric },
    ];
    if (!same(demandLines.withFuels, demandLines.elec) && !same(demandLines.withFuels, demandLines.total)) {
      out.push({ name: t.electricFuelDemand, values: demandLines.withFuels, color: carrierColors.fuels, tag: t.tags.fuels });
    }
    return out;
  }, [carriersShown, demandLines, t]);

  const note = [modeNote(units, 'supply'), noFuels ? t.elecOnlyNote : ''].filter(Boolean).join(' ');

  // ── Sliders ──────────────────────────────────────────────────────────────
  const horizon = (key: string) => {
    const p = (isFuelKey(key) ? plan.fuels : plan.electric).find((x) => x.source === key && x.year === horizonYear);
    return { twh: toTWh(p?.energy ?? 0), gw: toGW(p?.power ?? 0) };
  };
  const gwFmt = (v: number) => `${v.toFixed(2)} GW`;
  const perYear = (v: number) => t.perYear(v.toFixed(2));
  const yearFmt = (v: number) => String(Math.round(v));
  const pctFmt = (v: number) => `${v.toFixed(0)}%`;
  // Sliders are in display units (GW, GW/year, %); the parameters are stored in SI (W, W/year, fraction).
  const scale = (field: string) => PARAM_SCALE[field] ?? 1;
  const get = (group: PlanParamGroup, field: string) =>
    (params[group] as Record<string, number>)[field] * scale(field);
  const base = (group: PlanParamGroup, field: string) =>
    (presetParams[group] as Record<string, number>)[field] * scale(field);
  /** Writes a (rounded) display value as SI. */
  const setDisplay = (group: PlanParamGroup, field: string, display: number) =>
    setParam(group, { [field]: display / scale(field) });

  /** A single-parameter slider row (inside ⚙, no side value). */
  const subRow = (group: PlanParamGroup, key: string, f: Field) => (
    <CenteredSlider
      key={f.field}
      label={f.label}
      color={colorFor(sourceColors, key, 0)}
      value={get(group, f.field)}
      range={f.range}
      onChange={(v) => setDisplay(group, f.field, f.range.step >= 1 ? Math.round(v) : Math.round(v * 100) / 100)}
      thumbLabel={t.thumb(label(key), f.label)}
      formatValue={f.format}
      sideValue={f.format(get(group, f.field))}
    />
  );

  /** A source's main row: one slider, and extra fields behind ⚙. */
  const row = (group: PlanParamGroup, key: string, main: Field, extra: Field[], color = colorFor(sourceColors, key, 0)) => {
    const h = horizon(key);
    const isFuel = isFuelKey(key);
    // A source edited manually in the demand-and-supply tab no longer matches its rule; moving the slider reapplies the rule.
    const edited = isRuleKey(key) && !ruleMatches(scenario, key, baseYear, horizonYear);
    return (
      <CenteredSlider
        key={key}
        label={label(key)}
        color={color}
        value={get(group, main.field)}
        range={main.range}
        onChange={(v) => setDisplay(group, main.field, Math.round(v * 100) / 100)}
        thumbLabel={t.thumb(label(key), main.label)}
        formatValue={main.format}
        sideValue={`${fmt(h.twh, 0)} TWh`}
        sideNote={edited ? t.editedElsewhere : isFuel ? undefined : `${fmt(h.gw, 1)} GW`}
        gear={extra.length ? gear(key, he.plan.details(label(key))) : undefined}
      >
        {extra.length ? <Stack gap={0}>{extra.map((f) => subRow(group, key, f))}</Stack> : undefined}
      </CenteredSlider>
    );
  };

  /** A source row that fills whatever is left (no slider). */
  const residualRow = (key: string) => {
    const h = horizon(key);
    return (
      <Group key={key} justify="space-between" wrap="nowrap" py={6} gap="xs">
        <Group gap={6} wrap="nowrap">
          <ColorSquare color={colorFor(sourceColors, key, 0)} />
          <Text size="sm" fw={500}>
            {label(key)}
          </Text>
          {detail !== 'low' && (
            <Text size="xs" c="dimmed">
              {t.residual}
            </Text>
          )}
        </Group>
        {detail === 'high' && (
          <Text size="sm" style={{ direction: 'ltr' }}>
            {fmt(h.twh, 0)} TWh
          </Text>
        )}
      </Group>
    );
  };

  const slopeField = (group: PlanParamGroup): Field => ({
    field: 'slope',
    label: t.slope,
    range: centeredRange(base(group, 'slope'), 0.5, 0),
    format: perYear,
  });
  const startField = (group: PlanParamGroup): Field => ({
    field: 'start',
    label: t.start,
    range: yearRange(base(group, 'start')),
    format: yearFmt,
  });
  const rampFields = (group: PlanParamGroup): [Field, Field[]] => [
    { field: 'rate', label: t.rate, range: centeredRange(base(group, 'rate'), 0.5, 0), format: perYear },
    [startField(group), { field: 'rampYears', label: t.rampYears, range: { min: 0, max: 20, step: 1 }, format: yearFmt }],
  ];
  const shareField = (group: PlanParamGroup): Field => ({
    field: 'share',
    label: t.share(horizonYear),
    range: centeredRange(base(group, 'share'), 10, 0),
    format: pctFmt,
  });

  // ── The solar rules as one group: its slider scales the three slopes together (GW/year) ──
  const solarKey = 'cat:solar';
  const solarGroups = ['solar', 'solar30', 'solar40'] as const;
  const solarColor = categoryColors.solar;
  const solarShades = shadesOf(solarColor, solarGroups.length);
  const solarSlope = solarGroups.reduce((a, gr) => a + get(gr, 'slope'), 0);
  const solarBase = solarGroups.reduce((a, gr) => a + base(gr, 'slope'), 0);
  const solarHorizon = solarGroups.reduce(
    (a, gr) => {
      const h = horizon(gr);
      return { twh: a.twh + h.twh, gw: a.gw + h.gw };
    },
    { twh: 0, gw: 0 },
  );
  const solarName = he.groups.categories.solar;
  const solarCell = (
    <GroupCell
      key={solarKey}
      opened={expandedSet.has(solarKey)}
      head={
        <CenteredSlider
          leading={
            <DisclosureHandle
              opened={expandedSet.has(solarKey)}
              onToggle={() => toggleExpanded(solarKey)}
              label={he.groups.expand(solarName)}
            />
          }
          label={solarName}
          color={solarColor}
          value={solarSlope}
          range={centeredRange(solarBase, 1, 0)}
          disabled={solarSlope <= 0}
          onChange={(v) => {
            const k = solarSlope > 0 ? v / solarSlope : 0;
            setPlanParams(
              Object.fromEntries(
                solarGroups.map((gr) => [gr, { slope: (Math.round(get(gr, 'slope') * k * 100) / 100) / scale('slope') }]),
              ),
              totals,
            );
          }}
          thumbLabel={he.groups.slopeThumb(solarName)}
          formatValue={perYear}
          sideValue={`${fmt(solarHorizon.twh, 0)} TWh`}
          sideNote={`${fmt(solarHorizon.gw, 1)} GW`}
        />
      }
    >
      {row('solar', 'solar', slopeField('solar'), [
        { field: 'base', label: t.baseGW, range: centeredRange(base('solar', 'base'), 2, 0), format: gwFmt },
      ], solarShades[0])}
      {row('solar30', 'solar30', slopeField('solar30'), [startField('solar30')], solarShades[1])}
      {row('solar40', 'solar40', slopeField('solar40'), [startField('solar40')], solarShades[2])}
    </GroupCell>
  );

  const section = (heading: string, rows: ReactNode[]) => (
    <>
      <Text size="sm" fw={700} mt="xs">
        {heading}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
        {rows}
      </SimpleGrid>
    </>
  );

  return (
    <Stack gap="sm">
      <ChartCard
        title={he.viewBy.supplyLabel}
        titleControls={
          <ViewSelect
            ariaLabel={he.viewBy.supplyAriaLabel}
            value={supplyView}
            options={SUPPLY_VIEW_OPTIONS}
            onChange={setSupplyView}
          />
        }
        fileStem={`${scenarioName}-scenario-plan`}
        csv={() => planSupplyCsv(years, plan.electric, plan.fuels, label)}
        toPng={() => chartRef.current?.toPng() ?? null}
        controls={
          <ScenarioSelect
            id="plan-supply-scenario"
            ariaLabel={he.plan.supplyScenario}
            value={active}
            presets={SUPPLY_PRESETS}
            labels={he.plan.supplyPresets}
            colors={supplyPresetColors}
            onChange={select}
          />
        }
        footer={`${note ? `${note} ` : ''}${he.sampleData}`}
      >
        <StackedAreaChart
          ref={chartRef}
          years={years}
          stacked={stacked}
          line={line}
          lineSolid
          bounds={bounds}
          unit={unit}
          unitMenu={units === 'toe' ? <EnergyUnitSelect /> : undefined}
          digits={digits}
          targetYear={targetYear}
          height={370}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" mb={4}>
          <Title order={3} fz="sm">
            {t.params}
          </Title>
          <Button size="compact-xs" variant="subtle" onClick={() => reset()}>
            {t.reset}
          </Button>
        </Group>
        {detail === 'high' && (
          <Text size="xs" c="dimmed" mb={4}>
            {t.hint(horizonYear)} {t.solarHint}
          </Text>
        )}
        {section(c.electricity, [
          solarCell,
          row(
            'importElectricity',
            'importElectricity',
            {
              field: 'step',
              label: t.step,
              range: centeredRange(base('importElectricity', 'step'), 1, 0),
              format: gwFmt,
            },
            [
              startField('importElectricity'),
              {
                field: 'stepYears',
                label: t.stepYears,
                range: intRange(base('importElectricity', 'stepYears'), 4, 1),
                format: yearFmt,
              },
              { field: 'steps', label: t.steps, range: intRange(base('importElectricity', 'steps'), 3, 1), format: yearFmt },
            ],
          ),
          row('geothermal', 'geothermal', ...rampFields('geothermal')),
          row('fusion', 'fusion', ...rampFields('fusion')),
          residualRow('gas'),
        ])}
        {section(c.fuels, [
          row('cleanFuels', 'importClean', shareField('cleanFuels'), [startField('cleanFuels')]),
          row('hydrogen', 'hydrogenImport', shareField('hydrogen'), [startField('hydrogen')]),
          residualRow('importFossil'),
          residualRow(GAS_DIRECT_KEY),
        ])}
      </Paper>
    </Stack>
  );
}

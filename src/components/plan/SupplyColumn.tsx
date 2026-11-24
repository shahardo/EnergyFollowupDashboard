import { Paper, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef } from 'react';
import { SUPPLY_PRESETS } from '../../data/baseline';
import { planParamsOf } from '../../data/scenarioPlan';
import { he } from '../../i18n/he';
import { supplyCsv } from '../../io/csvExport';
import { FUEL_KEYS, fuelSupplyPoints, measureNonElectric } from '../../model/carriers';
import { factorsOf } from '../../model/fuel';
import { flattenGroups } from '../../model/groups';
import { computeSupply, SCALE_FROM_YEAR } from '../../model/supply';
import { toGW } from '../../model/units';
import { useNonElectric } from '../../store/usePlanSeries';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore } from '../../store/uiStore';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { colorFor, shadesOf, sourceColors, supplyPresetColors } from '../charts/palette';
import { EnergyUnitSelect } from '../charts/EnergyUnitSelect';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { AutoFillPanel } from '../controls/AutoFillPanel';
import { ScenarioSelect } from './ScenarioSelect';
import { SupplyParams } from './SupplyParams';
import { sourceCategoryGroups, supplyCarrierGroups } from './supplyGroups';
import { ViewSelect } from './ViewSelect';
import { fuelValue, modeNote, supplyValue, unitInfo, useUnitFactor } from './unitSeries';

/** Options for the supply chart's view selector: supply channel (source), or final energy (carriers). */
const SUPPLY_VIEW_OPTIONS = [
  { value: 'sources' as const, label: he.viewBy.channel },
  { value: 'carriers' as const, label: he.viewBy.finalEnergy },
];

/**
 * The supply column in the plan page: the supply chart by source against the net-demand line (the gap stays
 * white), the policy picker, the parameter panel (`SupplyParams`: supply categories expandable into sources), and the
 * auto-fill panel.
 */
export function SupplyColumn() {
  const scenario = useSupplyStore((s) => s.scenario);
  const active = useSupplyStore((s) => s.active);
  const select = useSupplyStore((s) => s.select);
  const demandPreset = useSupplyStore((s) => s.demandPreset);
  const baseYear = useDemandStore((s) => s.scenario.baseYear);
  const horizonYear = useDemandStore((s) => s.scenario.horizonYear);
  const targetYear = useUiStore((s) => s.targetYear);
  const units = useUiStore((s) => s.units);
  const energyUnit = useUiStore((s) => s.energyUnit);
  const detail = useUiStore((s) => s.detail);
  const supplyView = useUiStore((s) => s.supplyView);
  const setSupplyView = useUiStore((s) => s.setSupplyView);
  const { years, supplyPoints, gap } = useSeries();
  const compareScenario = useCompareStore((s) => s.supply);
  const chartRef = useRef<ChartHandle>(null);
  const t = he.plan;
  const gw = units === 'gw';
  const { unit, digits } = unitInfo(units, energyUnit);
  const factors = useMemo(() => factorsOf(scenario.sources), [scenario.sources]);
  const valueOf = useMemo(() => supplyValue(units, factors, energyUnit), [units, factors, energyUnit]);
  const demand = useDemandStore((s) => s.scenario);
  const planParams = planParamsOf(scenario);
  const nePoints = useNonElectric();
  // In toe and emissions modes: non-electric fuel demand (shown in the demand chart) is supplied by clean-fuel, hydrogen and fossil imports.
  const nonElecFuel = useMemo(() => {
    const byKey = new Map<string, number[]>();
    if (units !== 'toe' && units !== 'co2') return byKey;
    const m = measureNonElectric(demand, nePoints, years);
    const pts = fuelSupplyPoints(
      m.fuels.map((f, i) => ({ year: f.year, energy: f.netEnergy + m.gas[i].netEnergy })),
      planParams,
      demand.horizonYear,
    );
    for (const key of FUEL_KEYS) {
      byKey.set(
        key,
        pts.filter((p) => p.source === key).map((p) => fuelValue(units, key, p.energy, energyUnit)),
      );
    }
    return byKey;
  }, [units, demand, nePoints, years, planParams, energyUnit]);
  // The demand line (J) is converted to the display unit by each year's supply mix.
  const factor = useUnitFactor(units, supplyPoints, years, factors, energyUnit);

  // ── Chart series: supply categories (or, in the final-energy view, carriers), each one band or, expanded, its items ──
  const expanded = useUiStore((st) => st.expanded);
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const stacked = useMemo(() => {
    const power = (s: (typeof scenario.sources)[number]) =>
      supplyPoints.filter((p) => p.source === s.key).map((p) => (s.enabled ? valueOf(p) : 0));
    if (supplyView === 'carriers') {
      const electric = scenario.sources.filter((s) => s.enabled).map((s) => ({ key: s.key, name: s.label, values: power(s) }));
      const fuels = FUEL_KEYS.map((k) => ({ key: k, name: he.scenarioPlan.sources[k] ?? k, values: nonElecFuel.get(k) ?? [] }));
      return flattenGroups(supplyCarrierGroups(electric, fuels), expandedSet, shadesOf);
    }
    const bands = scenario.sources
      // In BCM mode only gas sources go into the stack; a fuel source with non-electric fuels goes in even when disabled for power.
      .filter(
        (s) =>
          (s.enabled && (units !== 'bcm' || factors(s.key).burnsGas)) ||
          (nonElecFuel.get(s.key)?.some((v) => v > 0) ?? false),
      )
      .map((s) => {
        const fuel = nonElecFuel.get(s.key);
        const pw = power(s);
        return {
          key: s.key,
          name: s.label,
          color: colorFor(sourceColors, s.key, scenario.sources.indexOf(s)),
          values: fuel ? pw.map((v, i) => v + fuel[i]) : pw,
        };
      });
    return flattenGroups(sourceCategoryGroups(bands), expandedSet, shadesOf);
  }, [scenario, supplyPoints, valueOf, units, nonElecFuel, factors, supplyView, expandedSet]);
  // The gap isn't colored: it stays white, between the top of the stack and the demand line.
  const line = useMemo(
    () => ({
      name: t.netDemand,
      values: gap.map((g, i) => {
        if (gw) return toGW(g.peakDemand);
        let fuel = 0;
        for (const v of nonElecFuel.values()) fuel += v[i] ?? 0;
        return g.demandEnergy * factor(g.year) + fuel;
      }),
    }),
    [gap, gw, factor, t, nonElecFuel],
  );
  // The comparison scenario: its total supply each year, in the selected unit.
  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const total = new Map<number, number>();
    for (const p of computeSupply(compareScenario, years)) total.set(p.year, (total.get(p.year) ?? 0) + valueOf(p));
    return [{ name: he.compare.line(compareScenario.name), values: years.map((y) => total.get(y) ?? 0) }];
  }, [compareScenario, years, valueOf]);

  const note = [modeNote(units, 'supply'), nonElecFuel.size > 0 ? t.fuelsSuppliedNote : ''].filter(Boolean).join(' ');

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
        fileStem={`${scenario.name}-supply`}
        csv={() => supplyCsv(gap, supplyPoints, scenario.sources)}
        toPng={() => chartRef.current?.toPng() ?? null}
        compareName={compareScenario?.name}
        controls={
          <ScenarioSelect
            id="supply-scenario"
            ariaLabel={t.supplyScenario}
            value={active}
            presets={SUPPLY_PRESETS}
            labels={t.supplyPresets}
            colors={supplyPresetColors}
            onChange={select}
          />
        }
        footer={`${t.gapWhite} ${note ? `${note} ` : ''}${he.sampleData}`}
      >
        <StackedAreaChart
          ref={chartRef}
          years={years}
          stacked={stacked}
          line={line}
          lineSolid
          compare={compare}
          unit={unit}
          unitMenu={units === 'toe' ? <EnergyUnitSelect /> : undefined}
          digits={digits}
          targetYear={targetYear}
          height={370}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Title order={3} fz="sm" mb={4}>
          {t.supplyParams}
        </Title>
        {detail === 'high' && (
          <Text size="xs" c="dimmed" mb={4}>
            {t.fittedTo(t.demandPresets[demandPreset].label)}. {t.supplyHint(horizonYear, SCALE_FROM_YEAR)}
          </Text>
        )}
        <SupplyParams view={supplyView} baseYear={baseYear} horizonYear={horizonYear} />
      </Paper>

      <AutoFillPanel />
    </Stack>
  );
}

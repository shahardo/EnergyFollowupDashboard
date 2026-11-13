import { Checkbox, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef } from 'react';
import { SUPPLY_PRESETS, supplyPresets } from '../../data/baseline';
import { he } from '../../i18n/he';
import { supplyCsv } from '../../io/csvExport';
import { FUEL_KEYS, fuelSupplyPoints, measureNonElectric } from '../../model/carriers';
import { sourceBcm } from '../../model/fuel';
import { round2 } from '../../model/math';
import { centeredRange } from '../../model/sliderRange';
import {
  computeSupply,
  energyTWh,
  interpolateCapacity,
  SCALE_FROM_YEAR,
  scaleCapacityFrom,
  sourceCapacity,
} from '../../model/supply';
import { useScenarioPlanStore } from '../../store/scenarioPlanStore';
import { useNonElectric } from '../../store/usePlanSeries';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore } from '../../store/uiStore';
import { fmt } from '../../utils/format';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { colorFor, sourceColors, supplyPresetColors } from '../charts/palette';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { AutoFillPanel } from '../controls/AutoFillPanel';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { SourceDetails } from '../controls/SourceDetails';
import { ScenarioSelect } from './ScenarioSelect';
import { fuelValue, modeNote, SUPPLY_VALUE, unitInfo, useUnitFactor } from './unitSeries';

/**
 * עמודת ההיצע בדף התכנון: גרף ההיצע לפי מקור מול קו הביקוש נטו (הפער נשאר לבן), בורר המדיניות,
 * פאנל הפרמטרים (סליידר הספק בשנת האופק לכל מקור), ופאנל ההתאמה האוטומטית.
 */
export function SupplyColumn() {
  const scenario = useSupplyStore((s) => s.scenario);
  const updateSource = useSupplyStore((s) => s.updateSource);
  const active = useSupplyStore((s) => s.active);
  const select = useSupplyStore((s) => s.select);
  const demandPreset = useSupplyStore((s) => s.demandPreset);
  const baseYear = useDemandStore((s) => s.scenario.baseYear);
  const horizonYear = useDemandStore((s) => s.scenario.horizonYear);
  const targetYear = useUiStore((s) => s.targetYear);
  const units = useUiStore((s) => s.units);
  const detail = useUiStore((s) => s.detail);
  const { years, supplyPoints, gap } = useSeries();
  const compareScenario = useCompareStore((s) => s.supply);
  const chartRef = useRef<ChartHandle>(null);
  const gear = useSingleGear();
  const t = he.plan;
  const presetBase = supplyPresets[demandPreset][active];
  const gw = units === 'gw';
  const { unit, digits } = unitInfo(units);
  const valueOf = SUPPLY_VALUE[units];
  const demand = useDemandStore((s) => s.scenario);
  const planParams = useScenarioPlanStore((s) => s.params);
  const nePoints = useNonElectric();
  // בשעט"ן ובפליטות: דלקי התחבורה (שבגרף הביקוש) מסופקים ביבוא דלקים נקיים, מימן ופוסיליים.
  const transportFuel = useMemo(() => {
    const byKey = new Map<string, number[]>();
    if (units !== 'toe' && units !== 'co2') return byKey;
    const m = measureNonElectric(demand, nePoints, years, (k) => k === 'transport');
    const pts = fuelSupplyPoints(
      m.fuels.map((f, i) => ({ year: f.year, twh: f.netTWh + m.gas[i].netTWh })),
      planParams,
      demand.horizonYear,
    );
    for (const key of FUEL_KEYS) {
      byKey.set(
        key,
        pts.filter((p) => p.source === key).map((p) => fuelValue(units, key, p.twh)),
      );
    }
    return byKey;
  }, [units, demand, nePoints, years, planParams]);
  // קו הביקוש (ב-TWh) מומר לפי תמהיל ההיצע של כל שנה.
  const factor = useUnitFactor(units, supplyPoints, years);

  // ── סדרות הגרף ───────────────────────────────────────────────────────────
  const stacked = useMemo(
    () =>
      scenario.sources
        // במצב BCM רק מקורות הגז נכנסים לערימה; מקור דלק עם דלקי תחבורה נכנס גם כשהוא כבוי לחשמל.
        .filter(
          (s) =>
            (s.enabled && (units !== 'bcm' || sourceBcm(s.key, 1) > 0)) ||
            (transportFuel.get(s.key)?.some((v) => v > 0) ?? false),
        )
        .map((s) => {
          const fuel = transportFuel.get(s.key);
          const power = supplyPoints.filter((p) => p.source === s.key).map((p) => (s.enabled ? valueOf(p) : 0));
          return {
            name: s.label,
            color: colorFor(sourceColors, s.key, scenario.sources.indexOf(s)),
            values: fuel ? power.map((v, i) => v + fuel[i]) : power,
          };
        }),
    [scenario.sources, supplyPoints, valueOf, units, transportFuel],
  );
  // הפער לא נצבע: הוא נשאר לבן, בין ראש הערימה לקו הביקוש.
  const line = useMemo(
    () => ({
      name: t.netDemand,
      values: gap.map((g, i) => {
        if (gw) return g.peakDemandGW;
        let fuel = 0;
        for (const v of transportFuel.values()) fuel += v[i] ?? 0;
        return g.demandTWh * factor(g.year) + fuel;
      }),
    }),
    [gap, gw, factor, t, transportFuel],
  );
  // תרחיש ההשוואה: סך ההיצע שלו בכל שנה, ביחידה הנבחרת.
  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const total = new Map<number, number>();
    for (const p of computeSupply(compareScenario, years)) total.set(p.year, (total.get(p.year) ?? 0) + valueOf(p));
    return [{ name: he.compare.line(compareScenario.name), values: years.map((y) => total.get(y) ?? 0) }];
  }, [compareScenario, years, valueOf]);

  const note = [modeNote(units, 'supply'), transportFuel.size > 0 ? t.transportFuelsNote : ''].filter(Boolean).join(' ');
  const title =
    units === 'bcm' ? t.supplyTitleBcm : units === 'co2' ? t.supplyTitleCo2 : `${t.supplyTitle} (${unit})`;

  return (
    <Stack gap="sm">
      <ChartCard
        title={title}
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
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
          {scenario.sources.map((s, i) => {
            const color = colorFor(sourceColors, s.key, i);
            // הסליידר קובע את ההספק בשנת האופק; הבסיס (אמצע הציר) הוא ערך התרחיש המוכן.
            const value = interpolateCapacity(s.capacityGW, horizonYear);
            const baseSrc = presetBase.sources.find((b) => b.key === s.key);
            const base = baseSrc ? interpolateCapacity(baseSrc.capacityGW, horizonYear) : value;
            const retired = s.retireYear !== undefined && horizonYear >= s.retireYear;
            const twh = energyTWh(sourceCapacity(s, horizonYear), s.capacityFactor);
            return (
              <CenteredSlider
                key={s.key}
                leading={
                  <Checkbox
                    size="xs"
                    checked={s.enabled}
                    aria-label={t.enable(s.label)}
                    onChange={(e) => updateSource(s.key, { enabled: e.currentTarget.checked })}
                  />
                }
                label={s.label}
                color={color}
                value={value}
                range={centeredRange(base, 5, 0)}
                disabled={!s.enabled || retired}
                onChange={(v) =>
                  updateSource(s.key, {
                    capacityGW: scaleCapacityFrom(s.capacityGW, SCALE_FROM_YEAR, horizonYear, round2(v)),
                  })
                }
                thumbLabel={t.capacityThumb(s.label, horizonYear)}
                formatValue={(v) => `${v.toFixed(1)} GW`}
                sideValue={retired ? t.retiredIn(s.retireYear!) : `${fmt(twh, 0)} TWh`}
                sideNote={retired ? undefined : `${fmt(value, 1)} GW`}
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
          })}
        </SimpleGrid>
      </Paper>

      <AutoFillPanel />
    </Stack>
  );
}

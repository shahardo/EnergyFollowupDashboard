import { Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef, type ReactNode } from 'react';
import { defaultPlanParams } from '../../data/scenarioPlan';
import { he } from '../../i18n/he';
import { planSupplyCsv } from '../../io/csvExport';
import { FUEL_KEYS } from '../../model/carriers';
import { GAS_DIRECT_KEY, PLAN_ELECTRIC_KEYS } from '../../model/scenarioPlan';
import { centeredRange, type SliderRange } from '../../model/sliderRange';
import { useDemandStore } from '../../store/demandStore';
import { useScenarioPlanStore, type PlanParamGroup } from '../../store/scenarioPlanStore';
import { usePlanSupply } from '../../store/usePlanSeries';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { fmt } from '../../utils/format';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { colorFor, sourceColors } from '../charts/palette';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { ColorSquare } from '../controls/inputs';
import { fuelValue, modeNote, SUPPLY_VALUE, unitInfo, useUnitFactor } from './unitSeries';

/** טווח לשנת התחלה: ±5 שנים סביב ברירת המחדל, בצעדים של שנה. */
const yearRange = (base: number): SliderRange => ({ min: base - 5, max: base + 5, step: 1 });
/** טווח למספר שלם (שנים, מדרגות) סביב ברירת המחדל. */
const intRange = (base: number, span: number, min = 0): SliderRange => ({
  min: Math.max(min, base - span),
  max: base + span,
  step: 1,
});

/** שדה אחד של קבוצת פרמטרים: שם, טווח ותצוגה. */
interface Field {
  field: string;
  label: string;
  range: SliderRange;
  format: (v: number) => string;
}

/**
 * עמודת האספקה בטאב תכנון התרחישים: מקורות החשמל לפי הכללים (הגז משלים) והדלקים לפי התמהיל (הפוסיליים
 * משלימים), בגרף שטחים נערמים מול קו הביקוש הכולל; בתצוגת מקורות אנרגיה גם קווי הגבול של כל נשא.
 * מתחת: סליידר לכל כלל (השיפוע / הקצב / החלק), ושאר הפרמטרים מאחורי ⚙.
 */
export function PlanSupplyColumn() {
  const params = useScenarioPlanStore((s) => s.params);
  const setParam = useScenarioPlanStore((s) => s.setParam);
  const reset = useScenarioPlanStore((s) => s.reset);
  const horizonYear = useDemandStore((s) => s.scenario.horizonYear);
  const scenarioName = useDemandStore((s) => s.scenario.name);
  const targetYear = useUiStore((s) => s.targetYear);
  const units = useUiStore((s) => s.units);
  const view = useUiStore((s) => s.planView);
  const detail = useUiStore((s) => s.detail);
  const { years, totals } = useSeries();
  const plan = usePlanSupply();
  const chartRef = useRef<ChartHandle>(null);
  const gear = useSingleGear();
  const t = he.scenarioPlan;
  const c = he.plan.carriers;
  const gw = units === 'gw';
  const { unit, digits } = unitInfo(units);
  const factor = useUnitFactor(units, plan.electric, years);
  const label = (key: string) => t.sources[key] ?? key;

  // ── סדרות הגרף ───────────────────────────────────────────────────────────
  const valuesOf = (key: string) => {
    const electric = plan.electric.filter((p) => p.source === key);
    if (electric.length) return electric.map(SUPPLY_VALUE[units]);
    return plan.fuels.filter((p) => p.source === key).map((p) => fuelValue(units, key, p.twh));
  };
  const fuelKeys = [...FUEL_KEYS, GAS_DIRECT_KEY];
  const stacked = useMemo(
    () =>
      [...PLAN_ELECTRIC_KEYS, ...(gw ? [] : fuelKeys)]
        .map((key, i) => ({ name: label(key), color: colorFor(sourceColors, key, i), values: valuesOf(key) }))
        // רצועה שכולה אפס (למשל דלקים במצב BCM) לא נכנסת לגרף ולמקרא.
        .filter((s) => s.values.some((v) => v > 1e-9)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, units],
  );

  // הביקוש לכל נשא, מצטבר: חשמל, חשמל ודלקים, וכולל. הדלקים מסופקים במלואם, אז הביקוש שלהם = האספקה.
  const demandLines = useMemo(() => {
    const elec = totals.map((d) => (gw ? d.peakGW : d.twh * factor(d.year)));
    if (gw) return { elec, withFuels: elec, total: elec };
    const sum = (keys: string[]) => {
      const out = years.map(() => 0);
      for (const p of plan.fuels) {
        if (keys.includes(p.source)) out[years.indexOf(p.year)] += fuelValue(units, p.source, p.twh);
      }
      return out;
    };
    const fuels = sum([...FUEL_KEYS]);
    const gas = sum([GAS_DIRECT_KEY]);
    const withFuels = elec.map((v, i) => v + fuels[i]);
    return { elec, withFuels, total: withFuels.map((v, i) => v + gas[i]) };
  }, [totals, plan, years, units, gw, factor]);

  const line = useMemo(() => ({ name: t.totalDemand, values: demandLines.total }), [demandLines, t]);
  const bounds = useMemo(
    () =>
      view === 'carriers' && !gw
        ? [
            { name: t.electricDemand, values: demandLines.elec, color: '#1c7ed6' },
            { name: t.electricFuelDemand, values: demandLines.withFuels, color: '#e8590c' },
          ]
        : undefined,
    [view, gw, demandLines, t],
  );

  const title = `${view === 'carriers' ? t.supplyTitleCarriers : t.supplyTitle} (${unit})`;
  const note = [modeNote(units, 'supply'), gw ? t.gwFuelsNote : ''].filter(Boolean).join(' ');

  // ── הסליידרים ────────────────────────────────────────────────────────────
  const horizon = (key: string) => {
    const p = [...plan.electric, ...plan.fuels].find((x) => x.source === key && x.year === horizonYear);
    return { twh: p?.twh ?? 0, gw: p?.gw ?? 0 };
  };
  const gwFmt = (v: number) => `${v.toFixed(2)} GW`;
  const perYear = (v: number) => t.perYear(v.toFixed(2));
  const yearFmt = (v: number) => String(Math.round(v));
  const pctFmt = (v: number) => `${v.toFixed(0)}%`;
  const get = (group: PlanParamGroup, field: string) => (params[group] as Record<string, number>)[field];
  const base = (group: PlanParamGroup, field: string) => (defaultPlanParams[group] as Record<string, number>)[field];

  /** שורת סליידר של פרמטר אחד (בתוך ⚙, בלי ערך בצד). */
  const subRow = (group: PlanParamGroup, key: string, f: Field) => (
    <CenteredSlider
      key={f.field}
      label={f.label}
      color={colorFor(sourceColors, key, 0)}
      value={get(group, f.field)}
      range={f.range}
      onChange={(v) => setParam(group, { [f.field]: f.range.step >= 1 ? Math.round(v) : Math.round(v * 100) / 100 })}
      thumbLabel={t.thumb(label(key), f.label)}
      formatValue={f.format}
      sideValue={f.format(get(group, f.field))}
    />
  );

  /** שורה ראשית של מקור: סליידר אחד, ושדות נוספים מאחורי ⚙. */
  const row = (group: PlanParamGroup, key: string, main: Field, extra: Field[]) => {
    const h = horizon(key);
    const isFuel = (FUEL_KEYS as readonly string[]).includes(key);
    return (
      <CenteredSlider
        key={key}
        label={label(key)}
        color={colorFor(sourceColors, key, 0)}
        value={get(group, main.field)}
        range={main.range}
        onChange={(v) => setParam(group, { [main.field]: Math.round(v * 100) / 100 })}
        thumbLabel={t.thumb(label(key), main.label)}
        formatValue={main.format}
        sideValue={`${fmt(h.twh, 0)} TWh`}
        sideNote={isFuel ? undefined : `${fmt(h.gw, 1)} GW`}
        gear={extra.length ? gear(key, he.plan.details(label(key))) : undefined}
      >
        {extra.length ? <Stack gap={0}>{extra.map((f) => subRow(group, key, f))}</Stack> : undefined}
      </CenteredSlider>
    );
  };

  /** שורת מקור שמשלים את מה שנשאר (בלי סליידר). */
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
    field: 'slopeGW',
    label: t.slope,
    range: centeredRange(base(group, 'slopeGW'), 0.5, 0),
    format: perYear,
  });
  const startField = (group: PlanParamGroup): Field => ({
    field: 'start',
    label: t.start,
    range: yearRange(base(group, 'start')),
    format: yearFmt,
  });
  const rampFields = (group: PlanParamGroup): [Field, Field[]] => [
    { field: 'rateGW', label: t.rate, range: centeredRange(base(group, 'rateGW'), 0.5, 0), format: perYear },
    [startField(group), { field: 'rampYears', label: t.rampYears, range: intRange(base(group, 'rampYears'), 5), format: yearFmt }],
  ];
  const shareField = (group: PlanParamGroup): Field => ({
    field: 'sharePct',
    label: t.share(horizonYear),
    range: centeredRange(base(group, 'sharePct'), 10, 0),
    format: pctFmt,
  });

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
        title={title}
        fileStem={`${scenarioName}-scenario-plan`}
        csv={() => planSupplyCsv(years, plan.electric, plan.fuels, label)}
        toPng={() => chartRef.current?.toPng() ?? null}
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
          <Button size="compact-xs" variant="subtle" onClick={reset}>
            {t.reset}
          </Button>
        </Group>
        {detail === 'high' && (
          <Text size="xs" c="dimmed" mb={4}>
            {t.hint(horizonYear)} {t.solarHint}
          </Text>
        )}
        {section(c.electricity, [
          row('solar', 'solar', slopeField('solar'), [
            { field: 'baseGW', label: t.baseGW, range: centeredRange(base('solar', 'baseGW'), 2, 0), format: gwFmt },
          ]),
          row('solar30', 'solar30', slopeField('solar30'), [startField('solar30')]),
          row('solar40', 'solar40', slopeField('solar40'), [startField('solar40')]),
          row(
            'importElectricity',
            'importElectricity',
            {
              field: 'stepGW',
              label: t.step,
              range: centeredRange(base('importElectricity', 'stepGW'), 1, 0),
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

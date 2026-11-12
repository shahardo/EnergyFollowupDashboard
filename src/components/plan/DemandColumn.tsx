import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef } from 'react';
import { DEMAND_PRESETS, demandPresets } from '../../data/baseline';
import { he } from '../../i18n/he';
import { demandCsv } from '../../io/csvExport';
import { sectorTWh } from '../../model/demand';
import { NO_MEASURES, type MeasuredTotal } from '../../model/measures';
import { computeDemandSeries } from '../../model/series';
import { centeredRange } from '../../model/sliderRange';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { fmt } from '../../utils/format';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { colorFor, demandPresetColors, EFFICIENCY_COLOR, SAVING_COLOR, sectorColors } from '../charts/palette';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { SectorDetails } from '../controls/SectorDetails';
import { MeasuresPanel } from './MeasuresPanel';
import { ScenarioSelect } from './ScenarioSelect';
import { modeNote, unitInfo, useUnitFactor } from './unitSeries';

/** הפרש עם סימן (+ / − / בלי), בלי ספרות אחרי הנקודה. */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 0)}`;

/**
 * עמודת הביקוש בדף התכנון: גרף הביקוש לפי מגזר (עם פס ההפחתות וקו הביקוש נטו), בורר התרחיש,
 * ופאנל הפרמטרים: סליידר צמיחה לכל מגזר והתייעלות / חיסכון.
 */
export function DemandColumn() {
  const scenario = useDemandStore((s) => s.scenario);
  const updateSector = useDemandStore((s) => s.updateSector);
  const active = useDemandStore((s) => s.active);
  const select = useDemandStore((s) => s.select);
  const targetYear = useUiStore((s) => s.targetYear);
  const selectedUnits = useUiStore((s) => s.units);
  const detail = useUiStore((s) => s.detail);
  const reductionBold = useUiStore((s) => s.reductionBold);
  const { years, demandPoints, measured, supplyPoints } = useSeries();
  const compareScenario = useCompareStore((s) => s.demand);
  const chartRef = useRef<ChartHandle>(null);
  const gear = useSingleGear();
  const t = he.plan;
  const presetBase = demandPresets[active];
  // במצבי BCM ו-tCO₂eq הביקוש מוצג כאנרגיה ראשונית (שעט"ן).
  const units = selectedUnits === 'bcm' || selectedUnits === 'co2' ? 'toe' : selectedUnits;
  const gw = units === 'gw';
  const { unit, digits } = unitInfo(units);
  const { baseYear, horizonYear } = scenario;
  // שעט"ן: ה-TWh של כל מגזר כפול מקדם ההמרה של תמהיל ההיצע באותה שנה.
  const factor = useUnitFactor(units, supplyPoints, years);

  // ── סדרות הגרף ───────────────────────────────────────────────────────────
  const stacked = useMemo(
    () =>
      scenario.sectors.map((s, i) => ({
        name: s.label,
        color: colorFor(sectorColors, s.key, i),
        values: demandPoints
          .filter((p) => p.sector === s.key)
          .map((p) => (gw ? p.peakGW : p.twh * factor(p.year))),
      })),
    [scenario.sectors, demandPoints, gw, factor],
  );

  // הביקוש נטו ביחידה הנבחרת: הקו, ובסיס פס ההפחתות.
  const measures = scenario.measures ?? NO_MEASURES;
  const hasReduction = measures.efficiencyPct > 0 || measures.savingPct > 0;
  const net = useMemo(
    () => measured.map((m) => (gw ? m.netPeakGW : m.netTWh * factor(m.year))),
    [measured, gw, factor],
  );
  const netLine = useMemo(() => (hasReduction ? { name: t.netDemand, values: net } : undefined), [hasReduction, net, t]);

  // התייעלות וחיסכון: פס בפסים בראש ערימת המגזרים (ביקוש ברוטו), מקו הביקוש נטו ועד הברוטו.
  const reduction = useMemo(() => {
    if (!hasReduction) return undefined;
    // במצב GW: ההפחתה בשיא באותו יחס כמו באנרגיה; בשעט"ן: לפי מקדם ההמרה של השנה.
    const share = (m: MeasuredTotal, twh: number) =>
      gw ? (m.grossTWh > 0 ? (m.grossPeakGW * twh) / m.grossTWh : 0) : twh * factor(m.year);
    return {
      net,
      layers: [
        { name: t.saving, color: SAVING_COLOR, values: measured.map((m) => share(m, m.savingTWh)) },
        { name: t.efficiency, color: EFFICIENCY_COLOR, values: measured.map((m) => share(m, m.efficiencyTWh)) },
      ],
      faint: !reductionBold,
    };
  }, [hasReduction, net, measured, gw, factor, t, reductionBold]);

  // תרחיש ההשוואה: הביקוש נטו שלו, רק בשנים שיש לו (null מחוץ לטווח שלו).
  const compare = useMemo(() => {
    if (!compareScenario) return undefined;
    const byYear = new Map(computeDemandSeries(compareScenario).measured.map((m) => [m.year, m]));
    return [
      {
        name: he.compare.line(compareScenario.name),
        values: years.map((y) => {
          const p = byYear.get(y);
          return p ? (gw ? p.netPeakGW : p.netTWh * factor(y)) : null;
        }),
      },
    ];
  }, [compareScenario, years, gw, factor]);

  // ── הסליידרים: ה-TWh של כל מגזר בשנת האופק, מול ה-TWh בצמיחת הבסיס ──────────────
  const horizonTWh = useMemo(
    () => new Map(demandPoints.filter((p) => p.year === horizonYear).map((p) => [p.sector, p.twh])),
    [demandPoints, horizonYear],
  );
  const note = modeNote(units, 'demand');

  return (
    <Stack gap="sm">
      <ChartCard
        title={`${t.demandTitle} (${unit})`}
        fileStem={`${scenario.name}-demand`}
        csv={() => demandCsv(demandPoints, measured, scenario.sectors)}
        toPng={() => chartRef.current?.toPng() ?? null}
        compareName={compareScenario?.name}
        controls={
          <ScenarioSelect
            id="demand-scenario"
            ariaLabel={t.demandScenario}
            value={active}
            presets={DEMAND_PRESETS}
            labels={t.demandPresets}
            colors={demandPresetColors}
            onChange={select}
          />
        }
        footer={`${note ? `${note} ` : ''}${he.sampleData}`}
      >
        <StackedAreaChart
          ref={chartRef}
          years={years}
          stacked={stacked}
          reduction={reduction}
          line={netLine}
          compare={compare}
          unit={unit}
          digits={digits}
          targetYear={targetYear}
          height={370}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Title order={3} fz="sm" mb={4}>
          {t.demandParams}
        </Title>
        {detail === 'high' && (
          <Text size="xs" c="dimmed" mb={4}>
            {t.centerHint(horizonYear)}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
          {scenario.sectors.map((s, i) => {
            const base = presetBase.sectors.find((b) => b.key === s.key)?.growthPct ?? s.growthPct;
            const twh = horizonTWh.get(s.key) ?? 0;
            const delta = twh - sectorTWh({ ...s, growthPct: base }, horizonYear, baseYear, horizonYear);
            return (
              <CenteredSlider
                key={s.key}
                label={s.label}
                color={colorFor(sectorColors, s.key, i)}
                value={s.growthPct}
                range={centeredRange(base, 3)}
                onChange={(growthPct) => updateSector(s.key, { growthPct: Math.round(growthPct * 100) / 100 })}
                thumbLabel={t.growthThumb(s.label)}
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
          })}
        </SimpleGrid>
        <MeasuresPanel />
      </Paper>
    </Stack>
  );
}

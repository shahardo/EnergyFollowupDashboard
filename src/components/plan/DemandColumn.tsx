import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef } from 'react';
import { DEMAND_PRESETS, demandPresets } from '../../data/baseline';
import { he } from '../../i18n/he';
import { demandCsv } from '../../io/csvExport';
import { sectorTWh } from '../../model/demand';
import { centeredRange } from '../../model/sliderRange';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useUiStore, type PlanView } from '../../store/uiStore';
import type { SupplyPoint } from '../../model/supply';
import { fmt } from '../../utils/format';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { colorFor, demandPresetColors, sectorColors } from '../charts/palette';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { CenteredSlider, useSingleGear } from '../controls/CenteredSlider';
import { SectorDetails } from '../controls/SectorDetails';
import { MeasuresPanel } from './MeasuresPanel';
import { ScenarioSelect } from './ScenarioSelect';
import { useDemandChart, type FuelScope } from './demandSeries';
import { modeNote, unitInfo } from './unitSeries';

/** הפרש עם סימן (+ / − / בלי), בלי ספרות אחרי הנקודה. */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 0)}`;

interface Props {
  /** תמהיל ההיצע לחשמל (להמרה לשעט"ן). אם חסר: ההיצע של תרחיש ההיצע הפעיל. */
  supplyPoints?: SupplyPoint[];
  /** מגזרים (ברירת מחדל) או מקורות אנרגיה סופיים. */
  view?: PlanView;
  /**
   * true: הביקוש שאינו חשמל של כל המגזרים נכנס בכל מצבי האנרגיה (טאב תכנון התרחישים).
   * false: רק התחבורה, מפוצלת לחשמל ודלקים, ורק בשעט"ן.
   */
  allFuels?: boolean;
}

/**
 * עמודת הביקוש בדף התכנון: גרף הביקוש לפי מגזר (עם פס ההפחתות וקו הביקוש נטו), בורר התרחיש,
 * ופאנל הפרמטרים: סליידר צמיחה לכל מגזר והתייעלות / חיסכון.
 */
export function DemandColumn({ supplyPoints, view = 'sectors', allFuels = false }: Props = {}) {
  const scenario = useDemandStore((s) => s.scenario);
  const updateSector = useDemandStore((s) => s.updateSector);
  const active = useDemandStore((s) => s.active);
  const select = useDemandStore((s) => s.select);
  const targetYear = useUiStore((s) => s.targetYear);
  const selectedUnits = useUiStore((s) => s.units);
  const detail = useUiStore((s) => s.detail);
  const { years, demandPoints, measured, supplyPoints: seriesSupply } = useSeries();
  const compareScenario = useCompareStore((s) => s.demand);
  const chartRef = useRef<ChartHandle>(null);
  const gear = useSingleGear();
  const t = he.plan;
  const presetBase = demandPresets[active];
  // במצבי BCM ו-tCO₂eq הביקוש מוצג כאנרגיה ראשונית (שעט"ן).
  const units = selectedUnits === 'bcm' || selectedUnits === 'co2' ? 'toe' : selectedUnits;
  const { unit, digits } = unitInfo(units);
  const { baseYear, horizonYear } = scenario;
  const fuels: FuelScope = allFuels ? 'all' : units === 'toe' ? 'transport' : 'none';

  // ── סדרות הגרף (משותף לשני הטאבים) ─────────────────────────────────────────
  const { stacked, reduction, line: netLine, compare, withFuels } = useDemandChart({
    units,
    view,
    fuels,
    supplyPoints: supplyPoints ?? seriesSupply,
  });

  // ── הסליידרים: ה-TWh של כל מגזר בשנת האופק, מול ה-TWh בצמיחת הבסיס ──────────────
  const horizonTWh = useMemo(
    () => new Map(demandPoints.filter((p) => p.year === horizonYear).map((p) => [p.sector, p.twh])),
    [demandPoints, horizonYear],
  );
  const note = [modeNote(units, 'demand'), withFuels ? (allFuels ? t.fuelsNote : t.transportFuelsNote) : '']
    .filter(Boolean)
    .join(' ');

  return (
    <Stack gap="sm">
      <ChartCard
        title={`${view === 'carriers' ? t.demandTitleCarriers : t.demandTitle} (${unit})`}
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

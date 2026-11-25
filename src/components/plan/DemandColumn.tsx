import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useMemo, useRef } from 'react';
import { DEMAND_PRESETS } from '../../data/baseline';
import { he } from '../../i18n/he';
import { demandCsv } from '../../io/csvExport';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { ChartCard } from '../charts/ChartCard';
import type { ChartHandle } from '../charts/echartsCore';
import { demandPresetColors } from '../charts/palette';
import { EnergyUnitSelect } from '../charts/EnergyUnitSelect';
import { StackedAreaChart } from '../charts/StackedAreaChart';
import { GroupLevelControl } from '../controls/GroupLevelControl';
import { DemandParams } from './DemandParams';
import { demandGroupKeys } from './demandGroups';
import { MeasuresPanel } from './MeasuresPanel';
import { ScenarioSelect } from './ScenarioSelect';
import { ViewSelect } from './ViewSelect';
import { useDemandChart, type FuelScope } from './demandSeries';
import { modeNote, unitInfo } from './unitSeries';

/** Options for the demand chart's view selector: by sector, or by energy source (carriers). */
const DEMAND_VIEW_OPTIONS = [
  { value: 'sectors' as const, label: he.viewBy.sector },
  { value: 'carriers' as const, label: he.viewBy.energySource },
];

/**
 * The demand column in the plan page: the demand chart by sector or energy source (with the reduction band and
 * net-demand line, the view selector in the title), the scenario picker, and the parameter panel (`DemandParams`:
 * main sectors or carriers, each expandable into its items) and efficiency/saving.
 * Shared by the plan tab and the scenario-planning tab (identical in both).
 */
export function DemandColumn() {
  const scenario = useDemandStore((s) => s.scenario);
  const active = useDemandStore((s) => s.active);
  const select = useDemandStore((s) => s.select);
  const targetYear = useUiStore((s) => s.targetYear);
  const selectedUnits = useUiStore((s) => s.units);
  const energyUnit = useUiStore((s) => s.energyUnit);
  const detail = useUiStore((s) => s.detail);
  const view = useUiStore((s) => s.planView);
  const setView = useUiStore((s) => s.setPlanView);
  const { years, demandPoints, measured } = useSeries();
  const compareScenario = useCompareStore((s) => s.demand);
  const chartRef = useRef<ChartHandle>(null);
  const groupKeys = useMemo(() => demandGroupKeys(scenario, view), [scenario, view]);
  const t = he.plan;
  // In BCM and tCO₂eq modes the demand is shown as total (final) energy (toe).
  const units = selectedUnits === 'bcm' || selectedUnits === 'co2' ? 'toe' : selectedUnits;
  const { unit, digits } = unitInfo(units, energyUnit);
  const { horizonYear } = scenario;
  // TWh/GW ("חשמל") show electricity only; fuels and direct gas (combined as final energy) go in only in toe mode.
  const fuels: FuelScope = units === 'toe' ? 'all' : 'none';

  // ── Chart series (shared by both tabs) ──────────────────────────────────────
  const { stacked, reduction, line: netLine, compare, withFuels } = useDemandChart({ units, view, fuels });

  const note = [modeNote(units, 'demand'), withFuels ? t.fuelsNote : ''].filter(Boolean).join(' ');

  return (
    <Stack gap="sm">
      <ChartCard
        title={he.viewBy.demandLabel}
        titleControls={
          <ViewSelect ariaLabel={he.viewBy.demandAriaLabel} value={view} options={DEMAND_VIEW_OPTIONS} onChange={setView} />
        }
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
          unitMenu={units === 'toe' ? <EnergyUnitSelect /> : undefined}
          digits={digits}
          targetYear={targetYear}
          height={370}
        />
      </ChartCard>

      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" mb={4} wrap="nowrap">
          <Title order={3} fz="sm">
            {t.demandParams}
          </Title>
          <GroupLevelControl keys={groupKeys} />
        </Group>
        {detail === 'high' && (
          <Text size="xs" c="dimmed" mb={4}>
            {t.centerHint(horizonYear)}
          </Text>
        )}
        <DemandParams view={view} />
        <MeasuresPanel />
      </Paper>
    </Stack>
  );
}

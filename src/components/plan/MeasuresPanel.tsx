import { Divider, SimpleGrid, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import { NO_MEASURES } from '../../model/measures';
import { MEASURE_MAX_PCT } from '../../schema';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { EFFICIENCY_COLOR, SAVING_COLOR } from '../charts/palette';
import { CenteredSlider } from '../controls/CenteredSlider';

const fmt = (v: number, d = 0) => v.toLocaleString('he-IL', { maximumFractionDigits: d });

/** התייעלות וחיסכון באנרגיה (DemandScenario.measures), בלוח הביקוש מתחת למגזרים. */
export function MeasuresPanel() {
  const scenario = useDemandStore((s) => s.scenario);
  const setMeasures = useDemandStore((s) => s.setMeasures);
  const { measured } = useSeries();
  const detail = useUiStore((s) => s.detail);
  const t = he.plan;
  const { horizonYear } = scenario;
  const measures = scenario.measures ?? NO_MEASURES;
  const horizon = measured.find((m) => m.year === horizonYear);

  return (
    <>
      <Divider my="sm" label={t.measuresTitle} labelPosition="right" />

      {detail === 'high' && (
        <Text size="xs" c="dimmed" mb={4}>
          {t.measuresHint(horizonYear)}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
        {(
          [
            {
              key: 'efficiencyPct',
              label: t.efficiency,
              hint: t.efficiencyHint,
              color: EFFICIENCY_COLOR,
              saved: horizon?.efficiencyTWh ?? 0,
            },
            {
              key: 'savingPct',
              label: t.saving,
              hint: t.savingHint,
              color: SAVING_COLOR,
              saved: horizon?.savingTWh ?? 0,
            },
          ] as const
        ).map((m) => (
          <div key={m.key} title={m.hint}>
            <CenteredSlider
              label={m.label}
              color={m.color}
              value={measures[m.key]}
              range={{ min: 0, max: MEASURE_MAX_PCT, step: 1 }}
              centered={false}
              onChange={(v) => setMeasures({ [m.key]: v })}
              thumbLabel={t.reductionThumb(m.label)}
              formatValue={(v) => `${v}%`}
              sideValue={m.saved > 0.05 ? `−${fmt(m.saved)} TWh` : '0 TWh'}
              sideNote={`${measures[m.key]}%`}
            />
          </div>
        ))}
      </SimpleGrid>
    </>
  );
}

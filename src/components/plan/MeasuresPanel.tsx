import { fromPct, toPct, toTWh } from '../../model/units';
import { Checkbox, Divider, SimpleGrid, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import { NO_MEASURES } from '../../model/measures';
import { MEASURE_MAX } from '../../schema';
import { useDemandStore } from '../../store/demandStore';
import { useSeries } from '../../store/useSeries';
import { useUiStore } from '../../store/uiStore';
import { EFFICIENCY_COLOR, SAVING_COLOR } from '../charts/palette';
import { fmt } from '../../utils/format';
import { CenteredSlider } from '../controls/CenteredSlider';

/** התייעלות וחיסכון באנרגיה (DemandScenario.measures), בלוח הביקוש מתחת למגזרים. */
export function MeasuresPanel() {
  const horizonYear = useDemandStore((s) => s.scenario.horizonYear);
  const measures = useDemandStore((s) => s.scenario.measures) ?? NO_MEASURES;
  const setMeasures = useDemandStore((s) => s.setMeasures);
  const { measured } = useSeries();
  const detail = useUiStore((s) => s.detail);
  const reductionBold = useUiStore((s) => s.reductionBold);
  const setReductionBold = useUiStore((s) => s.setReductionBold);
  const t = he.plan;
  const horizon = measured.find((m) => m.year === horizonYear);

  return (
    <>
      <Divider my="sm" label={t.measuresTitle} labelPosition="right" />

      {detail === 'high' && (
        <Text size="xs" c="dimmed" mb={4}>
          {t.measuresHint(horizonYear)}
        </Text>
      )}
      <Checkbox
        size="xs"
        mb={6}
        label={t.reductionBold}
        title={t.reductionBoldHint}
        checked={reductionBold}
        onChange={(e) => setReductionBold(e.currentTarget.checked)}
      />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing={0}>
        {(
          [
            {
              key: 'efficiency',
              label: t.efficiency,
              hint: t.efficiencyHint,
              color: EFFICIENCY_COLOR,
              saved: toTWh(horizon?.efficiencyEnergy ?? 0),
            },
            {
              key: 'saving',
              label: t.saving,
              hint: t.savingHint,
              color: SAVING_COLOR,
              saved: toTWh(horizon?.savingEnergy ?? 0),
            },
          ] as const
        ).map((m) => (
          <div key={m.key} title={m.hint}>
            <CenteredSlider
              label={m.label}
              color={m.color}
              value={Math.round(toPct(measures[m.key]))}
              range={{ min: 0, max: toPct(MEASURE_MAX), step: 1 }}
              centered={false}
              onChange={(v) => setMeasures({ [m.key]: fromPct(v) })}
              thumbLabel={t.reductionThumb(m.label)}
              formatValue={(v) => `${v}%`}
              sideValue={m.saved > 0.05 ? `−${fmt(m.saved, 0)} TWh` : '0 TWh'}
              sideNote={`${Math.round(toPct(measures[m.key]))}%`}
            />
          </div>
        ))}
      </SimpleGrid>
    </>
  );
}

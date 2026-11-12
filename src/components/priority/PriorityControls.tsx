import { Button, Group, Paper, SegmentedControl, Slider, Stack, Text, Title } from '@mantine/core';
import { weightPresets } from '../../data/trilemma';
import { he } from '../../i18n/he';
import { PRIORITY_AXES, normalizeWeights, type PriorityAxis } from '../../model/priority';
import { RETIRE_YEARS, usePriorityStore } from '../../store/priorityStore';
import { fmt } from '../../utils/format';

/** צבע כל ציר תעדוף (בסליידר ובתווית). */
export const AXIS_COLORS: Record<PriorityAxis, string> = {
  sustainability: 'teal',
  affordability: 'orange',
  security: 'blue',
  feasibility: 'grape',
};

/** שורת סליידר: תווית מימין, סליידר, וערך משמאל. */
function SliderRow(props: {
  label: string;
  color: string;
  value: number;
  min: number;
  max: number;
  step: number;
  side: string;
  thumbLabel: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(8rem, 11rem) 1fr 3.5rem', gap: 12, alignItems: 'center' }}>
      <Text size="sm" fw={500} c={props.color}>
        {props.label}
      </Text>
      <Slider
        color={props.color}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={props.onChange}
        thumbLabel={props.thumbLabel}
        label={null}
      />
      <Text size="sm" fw={600} ta="left" style={{ direction: 'ltr' }}>
        {props.side}
      </Text>
    </div>
  );
}

/** פאנל המשקלות: סליידר לכל ציר (המשקל המנורמל בצד), וכפתורי ערכות מוכנות. */
export function WeightsPanel() {
  const weights = usePriorityStore((s) => s.weights);
  const setWeight = usePriorityStore((s) => s.setWeight);
  const setWeights = usePriorityStore((s) => s.setWeights);
  const t = he.priority;
  const n = normalizeWeights(weights);
  return (
    <Paper withBorder p="sm" radius="md">
      <Title order={3} fz="sm" mb="xs">
        {t.weightsTitle}
      </Title>
      <Stack gap="sm">
        {PRIORITY_AXES.map((a) => (
          <SliderRow
            key={a}
            label={t.axes[a]}
            color={AXIS_COLORS[a]}
            value={weights[a]}
            min={0}
            max={100}
            step={5}
            side={`${fmt(n[a] * 100, 0)}%`}
            thumbLabel={t.weightThumb(t.axes[a])}
            onChange={(v) => setWeight(a, v)}
          />
        ))}
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            {t.presetsLabel}
          </Text>
          {(Object.keys(weightPresets) as (keyof typeof weightPresets)[]).map((k) => (
            <Button key={k} size="compact-xs" variant="default" onClick={() => setWeights(weightPresets[k])}>
              {t.presets[k]}
            </Button>
          ))}
        </Group>
      </Stack>
    </Paper>
  );
}

/** פאנל הבנייה וההשבתה: סף היישימות לבנייה חדשה, סף ההשבתה המוקדמת ושנת סיומה. */
export function OptionsPanel() {
  const minFeasibilityPct = usePriorityStore((s) => s.minFeasibilityPct);
  const retireBelow = usePriorityStore((s) => s.retireBelow);
  const retireByYear = usePriorityStore((s) => s.retireByYear);
  const setOptions = usePriorityStore((s) => s.setOptions);
  const t = he.priority;
  return (
    <Paper withBorder p="sm" radius="md">
      <Title order={3} fz="sm" mb="xs">
        {t.optionsTitle}
      </Title>
      <Stack gap="sm">
        <SliderRow
          label={t.minFeasibility}
          color="grape"
          value={minFeasibilityPct}
          min={0}
          max={100}
          step={5}
          side={`${minFeasibilityPct}%`}
          thumbLabel={t.minFeasibility}
          onChange={(v) => setOptions({ minFeasibilityPct: v })}
        />
        <Text size="xs" c="dimmed" mt={-6}>
          {t.minFeasibilityHint}
        </Text>
        <SliderRow
          label={t.retireBelow}
          color="red"
          value={retireBelow}
          min={0}
          max={10}
          step={0.5}
          side={retireBelow > 0 ? fmt(retireBelow, 1) : t.retireOff}
          thumbLabel={t.retireBelow}
          onChange={(v) => setOptions({ retireBelow: v })}
        />
        <Group gap="sm" wrap="wrap">
          <Text size="sm" fw={500}>
            {t.retireByYear}
          </Text>
          <SegmentedControl
            size="xs"
            aria-label={t.retireByYear}
            disabled={retireBelow <= 0}
            value={String(retireByYear)}
            onChange={(v) => setOptions({ retireByYear: Number(v) })}
            data={RETIRE_YEARS.map((y) => String(y))}
          />
        </Group>
        <Text size="xs" c="dimmed" mt={-6}>
          {t.retireHint(retireByYear)}
        </Text>
      </Stack>
    </Paper>
  );
}

import { Group, Select, Text } from '@mantine/core';
import { ScenarioSwatch } from './ScenarioSwatch';

interface Props<P extends string> {
  id: string;
  ariaLabel: string;
  value: P;
  /** התרחישים, בסדר התפריט. */
  presets: readonly P[];
  /** שם ותיאור לכל תרחיש. */
  labels: Record<P, { label: string; desc: string }>;
  /** צבע הנורית של כל תרחיש. */
  colors: Record<string, string>;
  onChange: (p: P) => void;
}

/**
 * בורר התרחיש המוכן בשורת הכותרת של כרטיס הגרף: במקום החץ, נורית בצבע התרחיש;
 * בכל שורה ברשימה השם, התיאור והנורית.
 */
export function ScenarioSelect<P extends string>({ id, ariaLabel, value, presets, labels, colors, onChange }: Props<P>) {
  return (
    <Select
      id={id}
      size="xs"
      w={{ base: '100%', xs: 200 }}
      aria-label={ariaLabel}
      allowDeselect={false}
      checkIconPosition="right"
      rightSection={<ScenarioSwatch color={colors[value]} />}
      rightSectionPointerEvents="none"
      value={value}
      onChange={(v) => v && onChange(v as P)}
      data={presets.map((p) => ({ value: p, label: labels[p].label }))}
      renderOption={({ option }) => (
        <Group gap={10} wrap="nowrap" align="flex-start" justify="space-between" w="100%">
          <div>
            <Text size="sm">{option.label}</Text>
            <Text size="xs" c="dimmed">
              {labels[option.value as P].desc}
            </Text>
          </div>
          <span style={{ marginTop: 6 }}>
            <ScenarioSwatch color={colors[option.value]} />
          </span>
        </Group>
      )}
    />
  );
}

import { Group, Paper, Text } from '@mantine/core';

export interface KpiValue {
  year: number;
  value: string;
  hint?: string;
  color?: string;
}

interface Props {
  label: string;
  /** ערך לכל שנה (למשל שנת היעד ושנת האופק), זה לצד זה. */
  values: KpiValue[];
}

export function KpiCard({ label, values }: Props) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <Group gap="md" wrap="nowrap" align="flex-start" grow>
        {values.map((v) => (
          <div key={v.year} style={{ minWidth: 0 }}>
            <Text size="xs" c="dimmed" fw={600}>
              {v.year}
            </Text>
            <Text fw={700} fz={19} lh={1.2} c={v.color} style={{ direction: 'ltr', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {v.value}
            </Text>
            {v.hint && (
              <Text size="xs" c="dimmed" lh={1.3} style={{ whiteSpace: 'nowrap' }}>
                {v.hint}
              </Text>
            )}
          </div>
        ))}
      </Group>
    </Paper>
  );
}

import { Paper, Text } from '@mantine/core';

interface Props {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}

export function KpiCard({ label, value, hint, color }: Props) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz={22} c={color} style={{ direction: 'ltr', textAlign: 'right' }}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Paper>
  );
}

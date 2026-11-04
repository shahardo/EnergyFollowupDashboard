import { Badge, Group, Paper, Progress, Text } from '@mantine/core';
import { statusColors } from '../charts/GanttChart';
import { he } from '../../i18n/he';
import type { ProjectStatus } from '../../schema';

interface Props {
  label: string;
  color: string;
  expectedGW: number;
  targetGW: number;
  counts: Record<ProjectStatus, number>;
}

const fmt = (v: number) => v.toLocaleString('he-IL', { maximumFractionDigits: 1 });

/** כרטיס ערוץ: ה-GW הצפויים מהפרויקטים מול היעד בתרחיש ההיצע (החיבור בין מסך 3 למסך 2). */
export function ChannelCard({ label, color, expectedGW, targetGW, counts }: Props) {
  const t = he.tracking;
  const ratio = targetGW > 0 ? expectedGW / targetGW : null;
  const tone = ratio === null ? 'gray' : ratio >= 0.9 ? 'teal' : ratio >= 0.6 ? 'orange' : 'red';
  const total = counts['on-track'] + counts['at-risk'] + counts.delayed;
  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap={8} wrap="nowrap" mb={4}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
        <Text fw={600} size="sm" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          {t.projectsCount(total)}
        </Text>
      </Group>
      <Group gap={4} align="baseline" wrap="nowrap" style={{ direction: 'ltr', justifyContent: 'flex-end' }}>
        <Text fw={700} fz={20} c={tone === 'gray' ? undefined : tone}>
          {fmt(expectedGW)}
        </Text>
        <Text size="sm" c="dimmed">
          / {targetGW > 0 ? fmt(targetGW) : '–'} GW
        </Text>
      </Group>
      <Progress
        value={ratio === null ? 0 : Math.min(100, ratio * 100)}
        color={tone}
        size="sm"
        mt={4}
        aria-label={`${t.expectedGW} ${fmt(expectedGW)} GW, ${t.targetGW} ${fmt(targetGW)} GW`}
      />
      <Text size="xs" c="dimmed" mt={4}>
        {targetGW > 0 ? `${t.expectedGW} / ${t.targetGW}` : t.noTarget}
      </Text>
      <Group gap={4} mt={6}>
        {(['on-track', 'at-risk', 'delayed'] as const).map((s) =>
          counts[s] > 0 ? (
            <Badge key={s} size="xs" variant="light" color={statusColors[s]}>
              {t.statuses[s]} {counts[s]}
            </Badge>
          ) : null,
        )}
      </Group>
    </Paper>
  );
}

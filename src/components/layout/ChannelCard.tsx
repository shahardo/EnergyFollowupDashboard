import { Badge, Group, Paper, Progress, Text } from '@mantine/core';
import { statusColors } from '../charts/GanttChart';
import { he } from '../../i18n/he';
import type { ProjectStatus } from '../../schema';

interface Props {
  label: string;
  color: string;
  /** ההספק החדש שתרחיש ההיצע דורש במקור עד שנת היעד. */
  targetGW: number;
  targetYear: number;
  /** התקדמות המשימות (0..100), או null כשאין משימות. */
  progressPct: number | null;
  taskCount: number;
  counts: Record<ProjectStatus, number>;
}

const fmt = (v: number) => v.toLocaleString('he-IL', { maximumFractionDigits: 1 });

/** כרטיס מקור אנרגיה: התקדמות המשימות שלו, ויעד ההספק החדש בתרחיש ההיצע (החיבור בין המעקב לתכנון). */
export function ChannelCard({ label, color, targetGW, targetYear, progressPct, taskCount, counts }: Props) {
  const t = he.tracking;
  const worst = counts.delayed > 0 ? 'red' : counts['at-risk'] > 0 ? 'orange' : 'teal';
  const tone = progressPct === null ? 'gray' : worst;
  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap={8} wrap="nowrap" mb={4}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
        <Text fw={600} size="sm" style={{ flex: 1 }} lineClamp={1} title={label}>
          {label}
        </Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {taskCount > 0 ? t.tasksCount(taskCount) : t.noTasks}
        </Text>
      </Group>
      <Group gap={4} align="baseline" wrap="nowrap" style={{ direction: 'ltr', justifyContent: 'flex-end' }}>
        <Text fw={700} fz={20} c={tone === 'gray' ? undefined : tone}>
          {progressPct === null ? '–' : `${Math.round(progressPct)}%`}
        </Text>
      </Group>
      <Progress
        value={progressPct ?? 0}
        color={tone}
        size="sm"
        mt={4}
        aria-label={`${t.taskProgress} ${progressPct === null ? '–' : Math.round(progressPct)}%`}
      />
      <Text size="xs" c="dimmed" mt={4}>
        {targetGW > 0 ? t.targetLine(fmt(targetGW), targetYear) : t.noTarget}
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

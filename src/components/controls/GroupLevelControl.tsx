import { ActionIcon, Button, Group, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import { useUiStore } from '../../store/uiStore';
import { DetailDot } from './DetailDot';

/**
 * "רמת פירוט:" and two dot buttons in a parameter panel's title row: the small dot collapses every group of the panel,
 * the medium dot expands them all (shared expand state, so the chart follows). The button matching the current state
 * is highlighted; neither is when some groups are open and some closed. Hidden when the panel has no groups.
 */
export function GroupLevelControl({ keys }: { keys: string[] }) {
  const expanded = useUiStore((s) => s.expanded);
  const setExpandedKeys = useUiStore((s) => s.setExpandedKeys);
  const g = he.groups;
  if (!keys.length) return null;
  const open = keys.filter((k) => expanded.includes(k)).length;
  const buttons = [
    { size: 6, label: g.collapseAll, active: open === 0, value: false },
    { size: 10, label: g.expandAll, active: open === keys.length, value: true },
  ];
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed">
        {g.levelLabel}
      </Text>
      <Button.Group>
        {buttons.map((b) => (
          <ActionIcon
            key={b.label}
            size="sm"
            variant={b.active ? 'light' : 'default'}
            aria-label={b.label}
            aria-pressed={b.active}
            onClick={() => setExpandedKeys(keys, b.value)}
          >
            <DetailDot size={b.size} text={b.label} />
          </ActionIcon>
        ))}
      </Button.Group>
    </Group>
  );
}

import { Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import { he } from '../../i18n/he';
import { flattenGroups, isExpandable, type SeriesGroup } from '../../model/groups';
import { useUiStore } from '../../store/uiStore';
import { DisclosureToggle } from '../controls/Disclosure';
import { ColorSquare } from '../controls/inputs';
import { shadesOf } from './palette';

/** The chart bands of `groups` under the shared expand state (`uiStore.expanded`). */
export function useGroupBands(groups: SeriesGroup[]) {
  const expanded = useUiStore((s) => s.expanded);
  return useMemo(() => flattenGroups(groups, new Set(expanded), shadesOf), [groups, expanded]);
}

/**
 * A compact row of triangle handles under a chart that has no parameter panel (priority, optimisation): one per
 * group that has more than one item, toggling the same shared expand state as the panels on the planning tabs.
 * HTML outside the chart canvas, so it isn't in the PNG.
 */
export function GroupToggles({ groups }: { groups: SeriesGroup[] }) {
  const expanded = useUiStore((s) => s.expanded);
  const toggle = useUiStore((s) => s.toggleExpanded);
  const list = groups.filter(isExpandable);
  if (!list.length) return null;
  return (
    <Group gap={2} mt={4} wrap="wrap" role="group" aria-label={he.groups.togglesLabel}>
      {list.map((g) => (
        <DisclosureToggle
          key={g.key}
          opened={expanded.includes(g.key)}
          onToggle={() => toggle(g.key)}
          label={
            <>
              <ColorSquare color={g.color} />
              <Text span size="xs">
                {g.name}
              </Text>
            </>
          }
        />
      ))}
    </Group>
  );
}

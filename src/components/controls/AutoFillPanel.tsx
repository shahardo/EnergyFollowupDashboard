import { Button, Collapse, Group, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { he } from '../../i18n/he';
import { autoFill } from '../../model/autofill';
import { useSeries } from '../../store/useSeries';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore } from '../../store/uiStore';
import { colorFor, sourceColors } from '../charts/palette';
import { PriorityList, type PriorityItem } from './PriorityList';

const fmt = (v: number) => v.toLocaleString('he-IL', { maximumFractionDigits: 1 });

export function AutoFillPanel() {
  const scenario = useSupplyStore((s) => s.scenario);
  const setFillPriority = useSupplyStore((s) => s.setFillPriority);
  const applyAutoFill = useSupplyStore((s) => s.applyAutoFill);
  const undo = useSupplyStore((s) => s.undoAutoFill);
  const canUndo = useSupplyStore((s) => s.previous !== null);
  const { totals } = useSeries();
  const open = useUiStore((s) => s.autofillOpen);
  const setOpen = useUiStore((s) => s.setAutofillOpen);
  const t = he.autofill;

  const included = new Set(scenario.fillPriority);
  const order = [
    ...scenario.fillPriority.filter((k) => scenario.sources.some((s) => s.key === k)),
    ...scenario.sources.map((s) => s.key).filter((k) => !included.has(k)),
  ];
  const items: PriorityItem[] = order.map((key) => {
    const i = scenario.sources.findIndex((s) => s.key === key);
    return { key, label: scenario.sources[i].label, color: colorFor(sourceColors, key, i), included: included.has(key) };
  });

  const onReorder = (keys: string[]) => setFillPriority(keys.filter((k) => included.has(k)));
  const onToggle = (key: string, on: boolean) =>
    setFillPriority(order.filter((k) => (k === key ? on : included.has(k))));

  const run = () => {
    const { scenario: next, addedGW } = autoFill(totals, scenario);
    const entries = Object.entries(addedGW);
    if (entries.length === 0) {
      notifications.show({ color: 'gray', message: t.nothing });
      return;
    }
    applyAutoFill(next);
    const label = (k: string) => scenario.sources.find((s) => s.key === k)?.label ?? k;
    notifications.show({
      color: 'teal',
      title: t.done,
      message: entries.map(([k, gw]) => t.added(label(k), fmt(gw))).join(' · '),
    });
  };

  return (
    <Paper withBorder p="sm" radius="md">
      <UnstyledButton
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t.toggle}
        style={{ width: '100%' }}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Title order={2} fz="md">
            {t.title}
          </Title>
          <Text
            c="dimmed"
            aria-hidden
            style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : undefined }}
          >
            ▾
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap="xs" mt="xs">
          <Group gap={6}>
            <Button size="xs" onClick={run} disabled={scenario.fillPriority.length === 0}>
              {t.run}
            </Button>
            <Button size="xs" variant="default" onClick={undo} disabled={!canUndo}>
              {t.undo}
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            {t.priorityHint} {t.explain}
          </Text>
          <PriorityList items={items} onReorder={onReorder} onToggle={onToggle} />
        </Stack>
      </Collapse>
    </Paper>
  );
}

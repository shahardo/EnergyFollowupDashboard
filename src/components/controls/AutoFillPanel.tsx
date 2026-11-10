import {
  Button,
  Checkbox,
  Collapse,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { he } from '../../i18n/he';
import { autoAdjust } from '../../model/autofill';
import { useSeries } from '../../store/useSeries';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore } from '../../store/uiStore';
import { colorFor, sourceColors } from '../charts/palette';

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

  // סדר המילוי הוא הסדר ב-fillPriority; מקור שמסמנים מצטרף לסופו.
  const included = new Set(scenario.fillPriority);
  const onToggle = (key: string, on: boolean) =>
    setFillPriority(
      on ? [...scenario.fillPriority.filter((k) => k !== key), key] : scenario.fillPriority.filter((k) => k !== key),
    );

  const run = () => {
    const { scenario: next, addedGW, removedGW } = autoAdjust(totals, scenario);
    const entries = Object.entries(addedGW);
    const removed = Object.entries(removedGW);
    if (entries.length === 0 && removed.length === 0) {
      notifications.show({ color: 'gray', message: t.nothing });
      return;
    }
    applyAutoFill(next);
    const label = (k: string) => scenario.sources.find((s) => s.key === k)?.label ?? k;
    notifications.show({
      color: 'teal',
      title: t.done,
      message: [
        ...entries.map(([k, gw]) => t.added(label(k), fmt(gw))),
        ...removed.map(([k, gw]) => t.removed(label(k), fmt(gw))),
      ].join(' · '),
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
            <Button size="xs" onClick={run}>
              {t.run}
            </Button>
            <Button size="xs" variant="default" onClick={undo} disabled={!canUndo}>
              {t.undo}
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            {t.explain}
          </Text>
          <Text size="xs" fw={600}>
            {t.sourcesTitle}
          </Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" verticalSpacing={6}>
            {scenario.sources.map((s, i) => (
              <Checkbox
                key={s.key}
                size="xs"
                checked={included.has(s.key)}
                onChange={(e) => onToggle(s.key, e.currentTarget.checked)}
                aria-label={t.include(s.label)}
                label={
                  <Group gap={6} wrap="nowrap">
                    <span
                      aria-hidden
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: colorFor(sourceColors, s.key, i),
                      }}
                    />
                    <Text size="sm" c={s.enabled ? undefined : 'dimmed'}>
                      {s.label}
                    </Text>
                  </Group>
                }
              />
            ))}
          </SimpleGrid>
          <Text size="xs" c="dimmed">
            {t.sourcesHint}
          </Text>
        </Stack>
      </Collapse>
    </Paper>
  );
}

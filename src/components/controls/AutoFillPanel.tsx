import {
  ActionIcon,
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
import { AUTOFILL_STEP_YEARS, FIRM_CREDIT_MIN, autoAdjust } from '../../model/autofill';
import { useSeries } from '../../store/useSeries';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore } from '../../store/uiStore';
import { colorFor, sourceColors } from '../charts/palette';
import { PlayIcon } from '../layout/icons';

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
    // שינויים קטנים מהדיוק המוצג (0.1 GW) לא נכנסים להודעה.
    const visible = ([, gw]: [string, number]) => gw >= 0.05;
    const entries = Object.entries(addedGW).filter(visible);
    const removed = Object.entries(removedGW).filter(visible);
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
      <Group wrap="nowrap" gap="xs">
        <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t.toggle}>
          <Title order={2} fz="md">
            {t.title}
          </Title>
        </UnstyledButton>
        {/* מכווץ: כפתור "נגן" צמוד לכותרת משמאל, שמריץ את ההתאמה בלי לפתוח את הפאנל. */}
        {!open && (
          <ActionIcon variant="light" color="teal" size="lg" radius="xl" aria-label={t.run} title={t.run} onClick={run}>
            <PlayIcon />
          </ActionIcon>
        )}
        {/* שאר השורה פותח וסוגר בלחיצה (נוחות לעכבר); הכפתור הנגיש הוא הכותרת. */}
        <div
          onClick={() => setOpen(!open)}
          style={{
            flex: 1,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            cursor: 'pointer',
          }}
        >
          <Text
            c="dimmed"
            aria-hidden
            style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : undefined }}
          >
            ▾
          </Text>
        </div>
      </Group>
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
            {t.explain(AUTOFILL_STEP_YEARS, FIRM_CREDIT_MIN)}
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

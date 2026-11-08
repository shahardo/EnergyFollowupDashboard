import {
  ActionIcon,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  type ButtonProps,
} from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { he } from '../../i18n/he';
import { useScenarioActions } from '../../io/useScenarioActions';
import { yearRange } from '../../model/years';
import type { ScenarioKind } from '../../schema';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useProjectsStore } from '../../store/projectsStore';
import { useUiStore, type Units } from '../../store/uiStore';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function Item({ onClick, children, ...rest }: ButtonProps & { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="default" fullWidth justify="flex-start" size="xs" onClick={onClick} {...rest}>
      {children}
    </Button>
  );
}

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = pathname.startsWith('/tracking') ? 'tracking' : 'plan';

  const { baseYear, horizonYear } = useDemandStore((s) => s.scenario);
  const projectsName = useProjectsStore((s) => s.data.name);
  const renameProjects = useProjectsStore((s) => s.rename);
  const { targetYear, setTargetYear, units, setUnits } = useUiStore();
  const actions = useScenarioActions();
  const [confirmReset, setConfirmReset] = useState<ScenarioKind | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  /** סוגר את חלון הפעולות ומריץ את הפעולה (באותה לחיצה, כדי שבחירת קובץ תעבוד). */
  const run = (fn: () => void) => {
    setActionsOpen(false);
    fn();
  };
  const hasCompare = useCompareStore((s) => s.demand !== null || s.supply !== null);
  const clearCompare = useCompareStore((s) => s.clear);
  const t = he.topBar;
  const years = yearRange(baseYear, horizonYear).map(String);

  const resetText: Record<ScenarioKind, string> = {
    demand: t.resetConfirmDemand,
    supply: t.resetConfirmSupply,
    projects: t.resetConfirm,
  };

  return (
    <Group justify="space-between" gap="sm" p="sm" wrap="wrap">
      <Group gap="sm" wrap="wrap">
        <Title order={1} fz={{ base: 'md', sm: 'lg' }}>
          {he.appTitle}
        </Title>
        <Tabs value={tab} onChange={(v) => v && navigate(`/${v}`)} variant="pills">
          <Tabs.List>
            <Tabs.Tab value="plan">{he.tabs.plan}</Tabs.Tab>
            <Tabs.Tab value="tracking">{he.tabs.tracking}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Group>
      <Group gap="xs" wrap="wrap" align="flex-end">
        <Select
          size="xs"
          w={90}
          label={t.targetYear}
          data={years}
          value={String(targetYear)}
          onChange={(v) => v && setTargetYear(Number(v))}
          allowDeselect={false}
        />
        <div>
          <SegmentedControl
            size="xs"
            aria-label={t.units}
            value={units}
            onChange={(v) => setUnits(v as Units)}
            data={[
              { value: 'twh', label: t.twh },
              { value: 'gw', label: t.gw },
            ]}
          />
        </div>

        {tab === 'tracking' && (
          <TextInput
            size="xs"
            w={{ base: 160, sm: 220 }}
            label={t.scenarioName}
            value={projectsName}
            onChange={(e) => renameProjects(e.currentTarget.value)}
          />
        )}

        <ActionIcon
          size="lg"
          variant="default"
          aria-label={t.actions}
          title={t.actions}
          onClick={() => setActionsOpen(true)}
          fz="lg"
        >
          ⚙
        </ActionIcon>

        <Modal opened={actionsOpen} onClose={() => setActionsOpen(false)} title={t.actions} size="sm">
          <Stack gap="md">
            {tab === 'plan' ? (
              <>
                <Section title={t.sectionSave}>
                  <Item onClick={() => run(() => actions.save('demand', false))}>{t.saveDemand}</Item>
                  <Item onClick={() => run(() => actions.save('supply', false))}>{t.saveSupply}</Item>
                  <Item onClick={() => run(() => actions.save('demand', true))}>{t.saveDemandAs}</Item>
                  <Item onClick={() => run(() => actions.save('supply', true))}>{t.saveSupplyAs}</Item>
                </Section>
                <Section title={t.sectionOpen}>
                  <Item onClick={() => run(actions.open)}>{t.openFile}</Item>
                  <Item onClick={() => run(actions.loadCompare)}>{he.compare.load}</Item>
                  <Item onClick={() => run(clearCompare)} disabled={!hasCompare}>
                    {he.compare.clear}
                  </Item>
                </Section>
                <Section title={t.sectionDuplicate}>
                  <Item onClick={() => run(() => actions.duplicate('demand'))}>{t.duplicateDemand}</Item>
                  <Item onClick={() => run(() => actions.duplicate('supply'))}>{t.duplicateSupply}</Item>
                </Section>
                <Section title={t.sectionReset}>
                  <Item color="red" onClick={() => run(() => setConfirmReset('demand'))}>
                    {t.resetDemand}
                  </Item>
                  <Item color="red" onClick={() => run(() => setConfirmReset('supply'))}>
                    {t.resetSupply}
                  </Item>
                </Section>
              </>
            ) : (
              <>
                <Section title={t.sectionSave}>
                  <Item onClick={() => run(() => actions.save('projects', false))}>{t.save}</Item>
                  <Item onClick={() => run(() => actions.save('projects', true))}>{t.saveAs}</Item>
                </Section>
                <Section title={t.sectionOpen}>
                  <Item onClick={() => run(actions.open)}>{t.openFile}</Item>
                </Section>
                <Section title={t.sectionDuplicate}>
                  <Item onClick={() => run(() => actions.duplicate('projects'))}>{t.duplicate}</Item>
                </Section>
                <Section title={t.sectionReset}>
                  <Item color="red" onClick={() => run(() => setConfirmReset('projects'))}>
                    {t.reset}
                  </Item>
                </Section>
              </>
            )}
          </Stack>
        </Modal>

        <Modal opened={confirmReset !== null} onClose={() => setConfirmReset(null)} title={t.resetTitle} size="sm">
          <Text size="sm" mb="md">
            {confirmReset ? resetText[confirmReset] : ''}
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => setConfirmReset(null)}>
              {t.cancel}
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (confirmReset) actions.reset(confirmReset);
                setConfirmReset(null);
              }}
            >
              {t.reset}
            </Button>
          </Group>
        </Modal>
      </Group>
    </Group>
  );
}

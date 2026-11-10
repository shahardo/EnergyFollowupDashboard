import {
  ActionIcon,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { he } from '../../i18n/he';
import { useScenarioActions } from '../../io/useScenarioActions';
import { yearRange } from '../../model/years';
import type { ScenarioKind } from '../../schema';
import { useDemandStore } from '../../store/demandStore';
import { useProjectsStore } from '../../store/projectsStore';
import { useUiStore, type Detail, type Units } from '../../store/uiStore';
import { ActionsModal } from './ActionsModal';

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = pathname.startsWith('/tracking') ? 'tracking' : 'plan';

  const { baseYear, horizonYear } = useDemandStore((s) => s.scenario);
  const projectsName = useProjectsStore((s) => s.data.name);
  const renameProjects = useProjectsStore((s) => s.rename);
  const { targetYear, setTargetYear, units, setUnits, detail, setDetail } = useUiStore();
  const actions = useScenarioActions();
  const [confirmReset, setConfirmReset] = useState<ScenarioKind | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
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
        {tab === 'plan' && (
          <SegmentedControl
            size="xs"
            aria-label={t.detail}
            title={t.detail}
            value={detail}
            onChange={(v) => setDetail(v as Detail)}
            data={[
              { value: 'high', label: t.detailHigh },
              { value: 'medium', label: t.detailMedium },
              { value: 'low', label: t.detailLow },
            ]}
          />
        )}

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

        <ActionsModal
          opened={actionsOpen}
          onClose={() => setActionsOpen(false)}
          tab={tab}
          actions={actions}
          onReset={setConfirmReset}
        />

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

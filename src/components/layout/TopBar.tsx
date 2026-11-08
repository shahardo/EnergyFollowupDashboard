import { Button, Group, Menu, Modal, SegmentedControl, Select, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { he } from '../../i18n/he';
import { useScenarioActions } from '../../io/useScenarioActions';
import { yearRange } from '../../model/years';
import type { ScenarioKind } from '../../schema';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useProjectsStore } from '../../store/projectsStore';
import { useUiStore, type Units } from '../../store/uiStore';

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

        {tab === 'plan' ? (
          <>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button size="xs">{t.save} ▾</Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => actions.save('demand', false)}>{t.saveDemand}</Menu.Item>
                <Menu.Item onClick={() => actions.save('supply', false)}>{t.saveSupply}</Menu.Item>
                <Menu.Divider />
                <Menu.Item onClick={() => actions.save('demand', true)}>{t.saveDemandAs}</Menu.Item>
                <Menu.Item onClick={() => actions.save('supply', true)}>{t.saveSupplyAs}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button size="xs" variant="default" onClick={actions.open}>
              {t.open}
            </Button>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button size="xs" variant="default">
                  {t.menu} ▾
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => actions.duplicate('demand')}>{t.duplicateDemand}</Menu.Item>
                <Menu.Item onClick={() => actions.duplicate('supply')}>{t.duplicateSupply}</Menu.Item>
                <Menu.Divider />
                <Menu.Item onClick={actions.loadCompare}>{he.compare.load}</Menu.Item>
                <Menu.Item onClick={clearCompare} disabled={!hasCompare}>
                  {he.compare.clear}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={() => setConfirmReset('demand')}>
                  {t.resetDemand}
                </Menu.Item>
                <Menu.Item color="red" onClick={() => setConfirmReset('supply')}>
                  {t.resetSupply}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        ) : (
          <>
            <TextInput
              size="xs"
              w={{ base: 160, sm: 220 }}
              label={t.scenarioName}
              value={projectsName}
              onChange={(e) => renameProjects(e.currentTarget.value)}
            />
            <Button size="xs" onClick={() => actions.save('projects', false)}>
              {t.save}
            </Button>
            <Button size="xs" variant="default" onClick={actions.open}>
              {t.open}
            </Button>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button size="xs" variant="default">
                  {t.menu} ▾
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => actions.save('projects', true)}>{t.saveAs}</Menu.Item>
                <Menu.Item onClick={() => actions.duplicate('projects')}>{t.duplicate}</Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={() => setConfirmReset('projects')}>
                  {t.reset}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        )}

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

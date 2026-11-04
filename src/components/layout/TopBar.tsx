import { Button, Group, Menu, SegmentedControl, Select, Tabs, TextInput, Title } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { he } from '../../i18n/he';
import { useScenarioActions } from '../../io/useScenarioActions';
import type { ScenarioKind } from '../../schema';
import { useDemandStore } from '../../store/demandStore';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore, type Units } from '../../store/uiStore';
import { yearRange } from '../../model/years';

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = pathname.replace('/', '') || 'demand';
  const kind: ScenarioKind | null = tab === 'demand' || tab === 'supply' ? tab : null;

  const demand = useDemandStore((s) => s.scenario);
  const renameDemand = useDemandStore((s) => s.rename);
  const supplyName = useSupplyStore((s) => s.scenario.name);
  const renameSupply = useSupplyStore((s) => s.rename);
  const { targetYear, setTargetYear, units, setUnits } = useUiStore();
  const actions = useScenarioActions();
  const t = he.topBar;

  const name = kind === 'demand' ? demand.name : kind === 'supply' ? supplyName : '';
  const rename = kind === 'demand' ? renameDemand : renameSupply;
  const years = yearRange(demand.baseYear, demand.horizonYear).map(String);

  return (
    <Group justify="space-between" gap="sm" p="sm" wrap="wrap">
      <Group gap="sm" wrap="wrap">
        <Title order={1} fz={{ base: 'md', sm: 'lg' }}>
          {he.appTitle}
        </Title>
        <Tabs value={tab} onChange={(v) => v && navigate(`/${v}`)} variant="pills">
          <Tabs.List>
            <Tabs.Tab value="demand">{he.tabs.demand}</Tabs.Tab>
            <Tabs.Tab value="supply">{he.tabs.supply}</Tabs.Tab>
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
        {kind && (
          <>
            <TextInput
              size="xs"
              w={{ base: 160, sm: 220 }}
              label={t.scenarioName}
              value={name}
              onChange={(e) => rename(e.currentTarget.value)}
            />
            <Button size="xs" onClick={() => actions.save(kind, false)}>
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
                <Menu.Item onClick={() => actions.save(kind, true)}>{t.saveAs}</Menu.Item>
                <Menu.Item onClick={() => actions.duplicate(kind)}>{t.duplicate}</Menu.Item>
                <Menu.Item color="red" onClick={() => actions.reset(kind)}>
                  {t.reset}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        )}
      </Group>
    </Group>
  );
}

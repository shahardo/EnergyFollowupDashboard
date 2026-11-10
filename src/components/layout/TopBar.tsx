import {
  ActionIcon,
  Button,
  Group,
  Input,
  Modal,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { he } from '../../i18n/he';
import { useScenarioActions } from '../../io/useScenarioActions';
import type { ScenarioKind } from '../../schema';
import { useDemandStore } from '../../store/demandStore';
import { useProjectsStore } from '../../store/projectsStore';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore, type Detail, type Units } from '../../store/uiStore';
import { ActionsModal } from './ActionsModal';

/** עיגול לבורר הפירוט: גודל העיגול = כמות הפירוט. השם נגיש וגם מופיע בריחוף. */
function DetailDot({ size, text }: { size: number; text: string }) {
  return (
    <span
      title={text}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 18, width: 18 }}
    >
      <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: 'currentColor' }} />
      <VisuallyHidden>{text}</VisuallyHidden>
    </span>
  );
}

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = pathname.startsWith('/tracking') ? 'tracking' : 'plan';

  const projectsName = useProjectsStore((s) => s.data.name);
  const renameProjects = useProjectsStore((s) => s.rename);
  const { units, setUnits, detail, setDetail } = useUiStore();
  const actions = useScenarioActions();
  const [confirmReset, setConfirmReset] = useState<ScenarioKind | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const demandPreset = useDemandStore((s) => s.active);
  const supplyPreset = useSupplyStore((s) => s.active);
  const t = he.topBar;

  const resetText: Record<ScenarioKind, string> = {
    demand: t.resetConfirmDemand(he.plan.demandPresets[demandPreset].label),
    supply: t.resetConfirmSupply(he.plan.supplyPresets[supplyPreset].label),
    projects: t.resetConfirm,
  };

  return (
    <Stack gap={0} pt="sm" px="sm">
      <Group justify="space-between" gap="sm" pb="xs" wrap="wrap">
        <Title order={1} fz={{ base: 'md', sm: 'lg' }}>
          {he.appTitle}
        </Title>
        <Group gap="xs" wrap="wrap" align="flex-end">
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
            <Input.Wrapper label={t.detail} size="xs">
              <SegmentedControl
                size="xs"
                display="flex"
                aria-label={t.detail}
                value={detail}
                onChange={(v) => setDetail(v as Detail)}
                data={(
                  [
                    ['high', 14, t.detailHigh],
                    ['medium', 10, t.detailMedium],
                    ['low', 6, t.detailLow],
                  ] as const
                ).map(([value, size, text]) => ({ value, label: <DetailDot size={size} text={text} /> }))}
              />
            </Input.Wrapper>
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
      <Tabs value={tab} onChange={(v) => v && navigate(`/${v}`)} variant="outline" radius="md">
        <Tabs.List>
          <Tabs.Tab value="plan" fz={{ base: 'sm', sm: 'md' }} fw={600} px="lg" py="sm">
            {he.tabs.plan}
          </Tabs.Tab>
          <Tabs.Tab value="tracking" fz={{ base: 'sm', sm: 'md' }} fw={600} px="lg" py="sm">
            {he.tabs.tracking}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
    </Stack>
  );
}

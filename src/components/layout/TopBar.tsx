import {
  ActionIcon,
  Button,
  Group,
  Input,
  Modal,
  SegmentedControl,
  Tabs,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { he } from '../../i18n/he';
import { useScenarioActions } from '../../io/useScenarioActions';
import type { ScenarioKind } from '../../schema';
import { useDemandStore } from '../../store/demandStore';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore, type Detail } from '../../store/uiStore';
import { ActionsModal } from './ActionsModal';
import { UnitsControl } from './UnitsControl';
import classes from './TopBar.module.css';

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
  const tab = (['tracking', 'trilemma', 'pyramid'] as const).find((v) => pathname.startsWith(`/${v}`)) ?? 'plan';

  const { detail, setDetail } = useUiStore();
  const actions = useScenarioActions();
  const [confirmReset, setConfirmReset] = useState<ScenarioKind | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const demandPreset = useDemandStore((s) => s.active);
  const supplyPreset = useSupplyStore((s) => s.active);
  const t = he.topBar;

  const resetText: Record<ScenarioKind, string> = {
    demand: t.resetConfirmPreset(he.plan.demandPresets[demandPreset].label),
    supply: t.resetConfirmPreset(he.plan.supplyPresets[supplyPreset].label),
    projects: t.resetConfirm,
  };

  return (
    <div className={classes.bar}>
      <Title order={1} fz={{ base: 'md', sm: 'lg' }} className={classes.title}>
        {he.appTitle}
      </Title>
      <Tabs
        className={classes.tabs}
        value={tab}
        onChange={(v) => v && navigate(`/${v}`)}
        unstyled
        classNames={{ list: classes.list, tab: classes.tab }}
      >
        <Tabs.List>
          <Tabs.Tab value="plan">{he.tabs.plan}</Tabs.Tab>
          <Tabs.Tab value="tracking">{he.tabs.tracking}</Tabs.Tab>
          <Tabs.Tab value="trilemma">{he.tabs.trilemma}</Tabs.Tab>
          <Tabs.Tab value="pyramid">{he.tabs.pyramid}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Group gap="xs" wrap="wrap" align="flex-end" className={classes.controls}>
        {/* היחידות לא רלוונטיות לטאב הטרילמה */}
        {tab === 'plan' && <UnitsControl className={classes.embossed} />}
        {tab === 'plan' && (
          <Input.Wrapper label={t.detail} size="xs">
            <SegmentedControl
              size="xs"
              display="flex"
              classNames={{ root: classes.embossed }}
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
          tab={tab === 'tracking' ? 'tracking' : 'plan'}
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
    </div>
  );
}

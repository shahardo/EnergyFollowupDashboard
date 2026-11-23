import { ActionIcon, Group, Input, Modal, SegmentedControl, Tabs, Title, VisuallyHidden } from '@mantine/core';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { he } from '../../i18n/he';
import { useScenarioActions } from '../../io/useScenarioActions';
import type { ScenarioKind } from '../../schema';
import { useApiStore } from '../../store/apiStore';
import { useDemandStore } from '../../store/demandStore';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore, type Detail } from '../../store/uiStore';
import { ActionsModal } from './ActionsModal';
import { ConfirmBody } from './ConfirmBody';
import { UnitsControl } from './UnitsControl';
import classes from './TopBar.module.css';

/** A dot for the detail selector: dot size = amount of detail. The name is accessible and also shows on hover. */
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

/**
 * The top bar: title, tabs, and on the left the controls: units and detail (only in the plan tabs), and ⚙ which
 * opens the actions window (save, open, compare, duplicate, reset, target year) and the reset confirmation.
 */
export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab =
    (['scenarios', 'priority', 'tracking', 'trilemma', 'optimize'] as const).find((v) =>
      pathname.startsWith(`/${v}`),
    ) ?? 'plan';
  const apiOnline = useApiStore((s) => s.status === 'online');

  const detail = useUiStore((s) => s.detail);
  const setDetail = useUiStore((s) => s.setDetail);
  const charts = tab === 'plan' || tab === 'scenarios';
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
          <Tabs.Tab value="scenarios">{he.tabs.scenarios}</Tabs.Tab>
          <Tabs.Tab value="priority">{he.tabs.priority}</Tabs.Tab>
          <Tabs.Tab value="tracking">{he.tabs.tracking}</Tabs.Tab>
          <Tabs.Tab value="trilemma">{he.tabs.trilemma}</Tabs.Tab>
          {apiOnline && <Tabs.Tab value="optimize">{he.tabs.optimize}</Tabs.Tab>}
        </Tabs.List>
      </Tabs>
      <Group gap="xs" wrap="wrap" align="flex-end" className={classes.controls}>
        {/* Units and detail belong to the charts and panels of the plan tabs; each chart's view selector sits in its own title. */}
        {charts && <UnitsControl className={classes.embossed} />}
        {charts && (
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
          <ConfirmBody
            message={confirmReset ? resetText[confirmReset] : ''}
            confirmLabel={t.reset}
            cancelLabel={t.cancel}
            onCancel={() => setConfirmReset(null)}
            onConfirm={() => {
              if (confirmReset) actions.reset(confirmReset);
              setConfirmReset(null);
            }}
          />
        </Modal>
      </Group>
    </div>
  );
}

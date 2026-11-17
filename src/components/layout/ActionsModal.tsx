import {
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ScenarioMeta } from '../../api/client';
import { he } from '../../i18n/he';
import type { useScenarioActions } from '../../io/useScenarioActions';
import { clamp } from '../../model/math';
import { yearRange } from '../../model/years';
import type { ScenarioKind } from '../../schema';
import { useApiStore } from '../../store/apiStore';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useProjectsStore } from '../../store/projectsStore';
import { useSupplyStore } from '../../store/supplyStore';
import { useUiStore } from '../../store/uiStore';
import { CompareIcon, CopyIcon, FolderIcon, ResetIcon, SaveIcon, ServerIcon } from './icons';

interface Props {
  opened: boolean;
  onClose: () => void;
  tab: 'plan' | 'tracking';
  actions: ReturnType<typeof useScenarioActions>;
  onReset: (kind: ScenarioKind) => void;
}

interface HeaderProps {
  icon: ReactNode;
  color: string;
  title: string;
  description: string;
}

/** אייקון צבעוני, כותרת ותיאור: הראש של כרטיס פעולה ושל שורת האיפוס. */
function ActionHeader({ icon, color, title, description, size = 36 }: HeaderProps & { size?: number }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon variant="light" color={color} size={size} radius="md">
        {icon}
      </ThemeIcon>
      <div style={{ minWidth: 0 }}>
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      </div>
    </Group>
  );
}

/** כרטיס פעולה: ראש (אייקון, כותרת, תיאור) ומתחתיו הכפתורים. */
function Card({ children, ...header }: HeaderProps & { children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <ActionHeader {...header} />
      <Stack gap={6} mt="sm">
        {children}
      </Stack>
    </Paper>
  );
}

/** שורה עם כותרת קצרה ושני כפתורים: ביקוש | היצע. */
function PairRow({
  label,
  color,
  variant = 'light',
  onDemand,
  onSupply,
}: {
  label?: string;
  color: string;
  variant?: string;
  onDemand: () => void;
  onSupply: () => void;
}) {
  const t = he.topBar;
  return (
    <Group gap={6} wrap="nowrap">
      {label && (
        <Text size="xs" c="dimmed" w={72} style={{ flexShrink: 0 }}>
          {label}
        </Text>
      )}
      <Button size="xs" variant={variant} color={color} flex={1} onClick={onDemand}>
        {t.demandShort}
      </Button>
      <Button size="xs" variant={variant} color={color} flex={1} onClick={onSupply}>
        {t.supplyShort}
      </Button>
    </Group>
  );
}

/**
 * כרטיס השרת (רק כשהשרת זמין): שמירה לשרת, ובחירה ופתיחה (או מחיקה) של תרחיש שמור. בטאב המעקב: המשימות.
 * כשהשרת דורש טוקן, שדה הטוקן כאן (הוא נשמר רק בדפדפן).
 */
function ServerCard({
  opened,
  tab,
  actions,
  run,
}: {
  opened: boolean;
  tab: Props['tab'];
  actions: Props['actions'];
  run: (fn: () => void) => () => void;
}) {
  const t = he.server;
  const health = useApiStore((s) => s.health);
  const token = useApiStore((s) => s.token);
  const setToken = useApiStore((s) => s.setToken);
  const [list, setList] = useState<ScenarioMeta[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const kinds = tab === 'plan' ? ['demand', 'supply'] : ['projects'];
  useEffect(() => {
    if (opened) api.listScenarios().then(setList).catch(() => setList([]));
  }, [opened]);
  const shown = list.filter((m) => kinds.includes(m.kind));
  const remove = async () => {
    if (!picked) return;
    try {
      await api.deleteScenario(picked);
      setList((l) => l.filter((m) => m.id !== picked));
      setPicked(null);
      notifications.show({ color: 'gray', message: t.deleted });
    } catch {
      notifications.show({ color: 'red', message: t.error });
    }
  };
  return (
    <Card icon={<ServerIcon />} color="cyan" title={t.sectionTitle} description={t.sectionDesc}>
      {health?.tokenRequired && (
        <PasswordInput
          size="xs"
          placeholder={t.token}
          aria-label={t.token}
          title={t.tokenHint}
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
        />
      )}
      {tab === 'plan' ? (
        <PairRow
          label={t.save}
          color="cyan"
          onDemand={run(() => actions.saveToServer('demand'))}
          onSupply={run(() => actions.saveToServer('supply'))}
        />
      ) : (
        <Button size="xs" variant="light" color="cyan" onClick={run(() => actions.saveToServer('projects'))}>
          {t.save}
        </Button>
      )}
      {shown.length ? (
        <Group gap={6} wrap="nowrap">
          <Select
            size="xs"
            flex={1}
            placeholder={t.pick}
            aria-label={t.pick}
            data={shown.map((m) => ({ value: m.id, label: `${t.kinds[m.kind]} · ${m.name}` }))}
            value={picked}
            onChange={setPicked}
            comboboxProps={{ withinPortal: true }}
          />
          <Button size="xs" color="cyan" disabled={!picked} onClick={run(() => picked && actions.openFromServer(picked))}>
            {t.open}
          </Button>
          <Button size="xs" variant="subtle" color="red" disabled={!picked} onClick={remove}>
            {t.delete}
          </Button>
        </Group>
      ) : (
        <Text size="xs" c="dimmed">
          {t.none}
        </Text>
      )}
    </Card>
  );
}

/** חלון השמירה, הפתיחה והפעולות, שנפתח מגלגל השיניים בפינת הסרגל העליון. */
export function ActionsModal({ opened, onClose, tab, actions, onReset }: Props) {
  const t = he.topBar;
  const demandName = useDemandStore((s) => s.scenario.name);
  const baseYear = useDemandStore((s) => s.scenario.baseYear);
  const horizonYear = useDemandStore((s) => s.scenario.horizonYear);
  const targetYear = useUiStore((s) => s.targetYear);
  const setTargetYear = useUiStore((s) => s.setTargetYear);
  const years = useMemo(() => yearRange(baseYear, horizonYear).map(String), [baseYear, horizonYear]);
  // שנת יעד שנשמרה מחוץ לטווח של התרחיש (למשל אחרי פתיחת קובץ אחר) מוצגת כשנה הקרובה בטווח.
  const shownTarget = clamp(targetYear, baseYear, horizonYear);
  const supplyName = useSupplyStore((s) => s.scenario.name);
  const projectsName = useProjectsStore((s) => s.data.name);
  const compareDemand = useCompareStore((s) => s.demand);
  const compareSupply = useCompareStore((s) => s.supply);
  const clearCompare = useCompareStore((s) => s.clear);
  const compareNames = [compareDemand?.name, compareSupply?.name].filter(Boolean).join(' · ');
  const apiOnline = useApiStore((s) => s.status === 'online');

  /** סוגר את החלון ומריץ את הפעולה באותה לחיצה, כדי שבחירת קובץ תעבוד. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const title = (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon variant="light" color="gray" size={32} radius="xl" fz="lg">
        ⚙
      </ThemeIcon>
      <div>
        <Text fw={700}>{t.actions}</Text>
        <Text size="xs" c="dimmed">
          {t.actionsSubtitle}
        </Text>
      </div>
    </Group>
  );

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="xl" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
          <Group gap={6} wrap="wrap">
            <Text size="xs" c="dimmed">
              {t.current}
            </Text>
            {tab === 'plan' ? (
              <>
                <Badge variant="light" color="blue" tt="none">
                  {t.demandShort}: {demandName}
                </Badge>
                <Badge variant="light" color="teal" tt="none">
                  {t.supplyShort}: {supplyName}
                </Badge>
              </>
            ) : (
              <Badge variant="light" color="blue" tt="none">
                {projectsName}
              </Badge>
            )}
          </Group>
          <Select
            size="xs"
            w={100}
            label={t.targetYear}
            data={years}
            value={String(shownTarget)}
            onChange={(v) => v && setTargetYear(Number(v))}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Card icon={<SaveIcon />} color="teal" title={t.sectionSave} description={t.saveDesc}>
            {tab === 'plan' ? (
              <>
                <PairRow
                  label={t.save}
                  color="teal"
                  variant="filled"
                  onDemand={run(() => actions.save('demand', false))}
                  onSupply={run(() => actions.save('supply', false))}
                />
                <PairRow
                  label={t.saveAs}
                  color="teal"
                  onDemand={run(() => actions.save('demand', true))}
                  onSupply={run(() => actions.save('supply', true))}
                />
              </>
            ) : (
              <Group gap={6} grow>
                <Button size="xs" color="teal" onClick={run(() => actions.save('projects', false))}>
                  {t.save}
                </Button>
                <Button size="xs" variant="light" color="teal" onClick={run(() => actions.save('projects', true))}>
                  {t.saveAs}
                </Button>
              </Group>
            )}
          </Card>

          <Card icon={<FolderIcon />} color="blue" title={t.sectionOpen} description={t.openDesc}>
            <Button size="xs" variant="light" color="blue" fullWidth onClick={run(actions.open)}>
              {t.openFile}
            </Button>
            <Text size="xs" c="dimmed">
              {t.dragHint}
            </Text>
          </Card>

          {tab === 'plan' && (
            <Card icon={<CompareIcon />} color="indigo" title={t.sectionCompare} description={t.compareDesc}>
              <Button size="xs" variant="light" color="indigo" fullWidth onClick={run(actions.loadCompare)}>
                {he.compare.load}
              </Button>
              {compareNames ? (
                <Group gap={6} justify="space-between" wrap="nowrap">
                  <Text size="xs" truncate="end">
                    {he.compare.chip(compareNames)}
                  </Text>
                  <Button size="compact-xs" variant="subtle" color="red" onClick={run(clearCompare)}>
                    {he.compare.clear}
                  </Button>
                </Group>
              ) : (
                <Text size="xs" c="dimmed">
                  {t.noCompare}
                </Text>
              )}
            </Card>
          )}

          <Card icon={<CopyIcon />} color="grape" title={t.sectionDuplicate} description={t.duplicateDesc}>
            {tab === 'plan' ? (
              <PairRow
                color="grape"
                onDemand={run(() => actions.duplicate('demand'))}
                onSupply={run(() => actions.duplicate('supply'))}
              />
            ) : (
              <Button
                size="xs"
                variant="light"
                color="grape"
                fullWidth
                onClick={run(() => actions.duplicate('projects'))}
              >
                {t.duplicate}
              </Button>
            )}
          </Card>
          {apiOnline && <ServerCard opened={opened} tab={tab} actions={actions} run={run} />}
        </SimpleGrid>

        <Divider />
        <Group justify="space-between" gap="sm" wrap="wrap">
          <ActionHeader icon={<ResetIcon />} color="red" size={32} title={t.sectionReset} description={t.resetDesc} />
          <Group gap={6}>
            {tab === 'plan' ? (
              <>
                <Button size="xs" variant="outline" color="red" onClick={run(() => onReset('demand'))}>
                  {t.resetDemand}
                </Button>
                <Button size="xs" variant="outline" color="red" onClick={run(() => onReset('supply'))}>
                  {t.resetSupply}
                </Button>
              </>
            ) : (
              <Button size="xs" variant="outline" color="red" onClick={run(() => onReset('projects'))}>
                {t.reset}
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

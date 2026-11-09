import { Badge, Button, Divider, Group, Modal, Paper, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import { he } from '../../i18n/he';
import type { useScenarioActions } from '../../io/useScenarioActions';
import type { ScenarioKind } from '../../schema';
import { useCompareStore } from '../../store/compareStore';
import { useDemandStore } from '../../store/demandStore';
import { useProjectsStore } from '../../store/projectsStore';
import { useSupplyStore } from '../../store/supplyStore';
import { CompareIcon, CopyIcon, FolderIcon, ResetIcon, SaveIcon } from './icons';

interface Props {
  opened: boolean;
  onClose: () => void;
  tab: 'plan' | 'tracking';
  actions: ReturnType<typeof useScenarioActions>;
  onReset: (kind: ScenarioKind) => void;
}

function Card({
  icon,
  color,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap="sm" wrap="nowrap" align="flex-start" mb="sm">
        <ThemeIcon variant="light" color={color} size={36} radius="md">
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
      <Stack gap={6}>{children}</Stack>
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

/** חלון השמירה, הפתיחה והפעולות, שנפתח מגלגל השיניים בפינת הסרגל העליון. */
export function ActionsModal({ opened, onClose, tab, actions, onReset }: Props) {
  const t = he.topBar;
  const demandName = useDemandStore((s) => s.scenario.name);
  const supplyName = useSupplyStore((s) => s.scenario.name);
  const projectsName = useProjectsStore((s) => s.data.name);
  const compareDemand = useCompareStore((s) => s.demand);
  const compareSupply = useCompareStore((s) => s.supply);
  const clearCompare = useCompareStore((s) => s.clear);
  const compareNames = [compareDemand?.name, compareSupply?.name].filter(Boolean).join(' · ');

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
        </SimpleGrid>

        <Divider />
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="red" size={32} radius="md">
              <ResetIcon />
            </ThemeIcon>
            <div>
              <Text fw={600} size="sm">
                {t.sectionReset}
              </Text>
              <Text size="xs" c="dimmed">
                {t.resetDesc}
              </Text>
            </div>
          </Group>
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

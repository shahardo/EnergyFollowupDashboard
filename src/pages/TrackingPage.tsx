import { Button, Group, MultiSelect, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ChartCard } from '../components/charts/ChartCard';
import { GanttChart } from '../components/charts/GanttChart';
import { colorFor, sourceColors } from '../components/charts/palette';
import type { ChartHandle } from '../components/charts/StackedAreaChart';
import { ProjectEditor } from '../components/controls/ProjectEditor';
import { ChannelCard } from '../components/layout/ChannelCard';
import { he } from '../i18n/he';
import { projectsCsv } from '../io/csvExport';
import { channelTargets, projectStatus, projectsToCapacity } from '../model/projects';
import type { Project, ProjectStatus } from '../schema';
import { useDemandStore } from '../store/demandStore';
import { useProjectsStore } from '../store/projectsStore';
import { useSupplyStore } from '../store/supplyStore';
import { useUiStore } from '../store/uiStore';

const STATUSES = ['on-track', 'at-risk', 'delayed'] as const;
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function TrackingPage() {
  const data = useProjectsStore((s) => s.data);
  const setAsOf = useProjectsStore((s) => s.setAsOf);
  const upsert = useProjectsStore((s) => s.upsertProject);
  const remove = useProjectsStore((s) => s.deleteProject);
  const supply = useSupplyStore((s) => s.scenario);
  const baseYear = useDemandStore((s) => s.scenario.baseYear);
  const targetYear = useUiStore((s) => s.targetYear);
  const chartRef = useRef<ChartHandle>(null);
  const t = he.tracking;

  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ project: Project; isNew: boolean } | null>(null);
  const [asOfDraft, setAsOfDraft] = useState(data.asOf);
  const [prevAsOf, setPrevAsOf] = useState(data.asOf);
  // סנכרון כשה-asOf משתנה מבחוץ (פתיחת קובץ, איפוס).
  if (prevAsOf !== data.asOf) {
    setPrevAsOf(data.asOf);
    setAsOfDraft(data.asOf);
  }

  const sourceIndex = useMemo(() => new Map(supply.sources.map((s, i) => [s.key, i])), [supply.sources]);
  const channelLabel = useCallback(
    (key: string) => supply.sources.find((s) => s.key === key)?.label ?? key,
    [supply.sources],
  );
  const channelColor = useCallback(
    (key: string) => colorFor(sourceColors, key, sourceIndex.get(key) ?? 0),
    [sourceIndex],
  );

  const ordered = useMemo(
    () =>
      [...data.projects].sort(
        (a, b) =>
          (sourceIndex.get(a.channel) ?? 99) - (sourceIndex.get(b.channel) ?? 99) ||
          a.plannedStart.localeCompare(b.plannedStart),
      ),
    [data.projects, sourceIndex],
  );
  const filtered = ordered.filter(
    (p) =>
      (channelFilter.length === 0 || channelFilter.includes(p.channel)) &&
      (statusFilter.length === 0 || statusFilter.includes(projectStatus(p, data.asOf))) &&
      (!ownerFilter || p.owner === ownerFilter),
  );

  const targets = useMemo(() => channelTargets(supply, baseYear, targetYear), [supply, baseYear, targetYear]);
  const cards = supply.sources
    .filter((s) => data.projects.some((p) => p.channel === s.key) || (targets[s.key] ?? 0) > 0)
    .map((s) => {
      const inChannel = data.projects.filter((p) => p.channel === s.key);
      const counts = { 'on-track': 0, 'at-risk': 0, delayed: 0 } as Record<ProjectStatus, number>;
      for (const p of inChannel) counts[projectStatus(p, data.asOf)]++;
      return {
        key: s.key,
        label: s.label,
        expectedGW: projectsToCapacity(data.projects, s.key, targetYear, data.asOf),
        targetGW: targets[s.key] ?? 0,
        counts,
      };
    });

  const owners = [...new Set(data.projects.map((p) => p.owner).filter(Boolean))].sort();
  const channelOptions = supply.sources.map((s) => ({ value: s.key, label: s.label }));

  const openNew = () => {
    const channel = channelFilter[0] ?? supply.sources[0]?.key ?? 'solar';
    const y = +data.asOf.slice(0, 4);
    setEditing({
      isNew: true,
      project: {
        id: crypto.randomUUID(),
        name: he.editor.newName,
        channel,
        owner: '',
        mw: 100,
        plannedStart: data.asOf,
        plannedEnd: `${y + 2}${data.asOf.slice(4)}`,
        progressPct: 0,
        milestones: [],
      },
    });
  };

  return (
    <Stack gap="md">
      <Paper withBorder p="sm" radius="md">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <TextInput
            id="as-of"
            type="date"
            label={t.asOf}
            w={160}
            value={asOfDraft}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setAsOfDraft(v);
              if (isIsoDate(v)) setAsOf(v);
            }}
          />
          <MultiSelect
            id="filter-channel"
            label={t.channel}
            data={channelOptions}
            value={channelFilter}
            onChange={setChannelFilter}
            clearable
            w={{ base: '100%', sm: 240 }}
          />
          <MultiSelect
            id="filter-status"
            label={t.status}
            data={STATUSES.map((s) => ({ value: s, label: t.statuses[s] }))}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            w={{ base: '100%', sm: 220 }}
          />
          <Select
            id="filter-owner"
            label={t.owner}
            placeholder={t.allOwners}
            data={owners}
            value={ownerFilter}
            onChange={setOwnerFilter}
            clearable
            w={{ base: '100%', sm: 180 }}
          />
          <Button onClick={openNew} ms={{ sm: 'auto' }}>
            + {t.add}
          </Button>
        </Group>
      </Paper>

      <Title order={2} fz="md">
        {t.channelCards(targetYear)}
      </Title>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
        {cards.map((c) => (
          <ChannelCard
            key={c.key}
            label={c.label}
            expectedGW={c.expectedGW}
            targetGW={c.targetGW}
            counts={c.counts}
            color={channelColor(c.key)}
          />
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt={-8}>
        {t.cardHint}
      </Text>

      <ChartCard
        title={t.gantt}
        fileStem={`${data.name}-projects`}
        csv={() => projectsCsv(filtered, data.asOf, channelLabel)}
        toPng={() => chartRef.current?.toPng() ?? null}
        footer={`${t.statusRule} ${t.sampleProjects}`}
      >
        {filtered.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t.noProjects}
          </Text>
        ) : (
          <GanttChart
            ref={chartRef}
            projects={filtered}
            asOf={data.asOf}
            channelLabel={channelLabel}
            channelColor={channelColor}
            onSelect={(id) => {
              const project = data.projects.find((p) => p.id === id);
              if (project) setEditing({ project, isNew: false });
            }}
          />
        )}
      </ChartCard>

      <ProjectEditor
        project={editing?.project ?? null}
        isNew={editing?.isNew ?? false}
        asOf={data.asOf}
        channels={channelOptions}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          upsert(p);
          setEditing(null);
          notifications.show({ color: 'teal', message: he.editor.saved });
        }}
        onDelete={(id) => {
          remove(id);
          setEditing(null);
          notifications.show({ color: 'gray', message: he.editor.deleted });
        }}
      />
    </Stack>
  );
}

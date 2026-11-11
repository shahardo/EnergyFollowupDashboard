import {
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ChartCard } from '../components/charts/ChartCard';
import { GanttChart, type GanttSource } from '../components/charts/GanttChart';
import { colorFor, sourceColors } from '../components/charts/palette';
import type { ChartHandle } from '../components/charts/StackedAreaChart';
import { ProjectEditor } from '../components/controls/ProjectEditor';
import { he } from '../i18n/he';
import { projectsCsv } from '../io/csvExport';
import { channelProgress, channelTargets, projectStatus, tasksDueBy } from '../model/projects';
import type { Project, ProjectStatus } from '../schema';
import { useDemandStore } from '../store/demandStore';
import { useProjectsStore } from '../store/projectsStore';
import { useSupplyStore } from '../store/supplyStore';
import { TRACKING_YEARS, useUiStore, type TrackingYear } from '../store/uiStore';

const STATUSES = ['on-track', 'at-risk', 'delayed'] as const;
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function TrackingPage() {
  const data = useProjectsStore((s) => s.data);
  const setAsOf = useProjectsStore((s) => s.setAsOf);
  const upsert = useProjectsStore((s) => s.upsertProject);
  const remove = useProjectsStore((s) => s.deleteProject);
  const supply = useSupplyStore((s) => s.scenario);
  const baseYear = useDemandStore((s) => s.scenario.baseYear);
  const trackingYear = useUiStore((s) => s.trackingYear);
  const setTrackingYear = useUiStore((s) => s.setTrackingYear);
  const chartRef = useRef<ChartHandle>(null);
  const t = he.tracking;

  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
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
  // כל מקורות האנרגיה של לוח ההיצע (גם כבויים) הם שורות בגאנט; סינון המקור מצמצם אותן.
  // תיבת ה-KPI של כל מקור סופרת רק את המשימות שמתוכננות להסתיים עד שנת הייחוס, והיעד הוא לאותה שנה.
  const targets = useMemo(() => channelTargets(supply, baseYear, trackingYear), [supply, baseYear, trackingYear]);
  const due = useMemo(() => tasksDueBy(data.projects, trackingYear), [data.projects, trackingYear]);
  const rows = useMemo<GanttSource[]>(
    () =>
      supply.sources
        .filter((s) => channelFilter.length === 0 || channelFilter.includes(s.key))
        .map((s) => {
          const counts = { 'on-track': 0, 'at-risk': 0, delayed: 0 } as Record<ProjectStatus, number>;
          for (const p of due) if (p.channel === s.key) counts[projectStatus(p, data.asOf)]++;
          return {
            key: s.key,
            label: s.label,
            progressPct: channelProgress(due, s.key),
            counts,
            targetGW: targets[s.key] ?? 0,
          };
        }),
    [supply.sources, channelFilter, due, targets, data.asOf],
  );
  const filtered = ordered.filter(
    (p) =>
      (channelFilter.length === 0 || channelFilter.includes(p.channel)) &&
      (statusFilter.length === 0 || statusFilter.includes(projectStatus(p, data.asOf))) &&
      (!ownerFilter || p.owner === ownerFilter),
  );

  const owners = [...new Set(data.projects.map((p) => p.owner).filter(Boolean))].sort();
  const channelOptions = supply.sources.map((s) => ({ value: s.key, label: s.label }));

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
        </Group>
      </Paper>

      <ChartCard
        title={t.gantt}
        fileStem={`${data.name}-tasks`}
        csv={() => projectsCsv(filtered, data.asOf, channelLabel)}
        toPng={() => chartRef.current?.toPng() ?? null}
        footer={`${t.statusRule} ${t.cardHint} ${t.sampleProjects}`}
      >
        {rows.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t.noProjects}
          </Text>
        ) : (
          <GanttChart
            ref={chartRef}
            tasks={filtered}
            sources={rows}
            targetYear={trackingYear}
            corner={(narrow) => (
              <Group gap={6} wrap="nowrap" justify={narrow ? 'flex-end' : 'space-between'} w="100%">
                {!narrow && (
                  <Text size="xs" c="dimmed">
                    {t.referenceYear}
                  </Text>
                )}
                <SegmentedControl
                  size="xs"
                  aria-label={t.referenceYear}
                  title={t.referenceYear}
                  value={String(trackingYear)}
                  onChange={(v) => setTrackingYear(Number(v) as TrackingYear)}
                  data={TRACKING_YEARS.map((y) => String(y))}
                />
              </Group>
            )}
            asOf={data.asOf}
            channelColor={channelColor}
            onSelect={(id) => setEditing(data.projects.find((p) => p.id === id) ?? null)}
          />
        )}
      </ChartCard>

      <ProjectEditor
        project={editing}
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

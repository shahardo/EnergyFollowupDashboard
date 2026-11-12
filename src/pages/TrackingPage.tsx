import { Group, MultiSelect, Paper, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ChartCard } from '../components/charts/ChartCard';
import { GanttChart, type GanttSource } from '../components/charts/GanttChart';
import { colorFor, sourceColors } from '../components/charts/palette';
import type { ChartHandle } from '../components/charts/echartsCore';
import { ProjectEditor } from '../components/controls/ProjectEditor';
import { he } from '../i18n/he';
import { projectsCsv } from '../io/csvExport';
import {
  AT_RISK_TOLERANCE,
  ON_TRACK_TOLERANCE,
  PROJECT_STATUSES,
  channelProgress,
  channelTargets,
  projectStatus,
  tasksDueBy,
} from '../model/projects';
import type { Project, ProjectStatus } from '../schema';
import { useDemandStore } from '../store/demandStore';
import { useProjectsStore } from '../store/projectsStore';
import { useSupplyStore } from '../store/supplyStore';
import { TRACKING_YEARS, useUiStore, type TrackingYear } from '../store/uiStore';

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * טאב המעקב: תאריך "נכון ל-" וסינון (מקור, סטטוס, גורם אחראי), גאנט מקורות האנרגיה עם תיבת KPI לכל
 * מקור ובורר שנת הייחוס, ועורך משימה שנפתח בלחיצה על תיבה.
 */
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
  const channelLabels = useMemo(() => new Map(supply.sources.map((s) => [s.key, s.label])), [supply.sources]);
  const channelLabel = useCallback((key: string) => channelLabels.get(key) ?? key, [channelLabels]);
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
  // סינון הסטטוס והגורם האחראי חל גם על תיבות המשימה וגם על תיבות ה-KPI, כדי שיתאימו זו לזו.
  const matches = useCallback(
    (p: Project) =>
      (statusFilter.length === 0 || statusFilter.includes(projectStatus(p, data.asOf))) &&
      (!ownerFilter || p.owner === ownerFilter),
    [statusFilter, ownerFilter, data.asOf],
  );
  // כל מקורות האנרגיה של לוח ההיצע (גם כבויים) הם שורות בגאנט; סינון המקור מצמצם אותן.
  // תיבת ה-KPI של כל מקור סופרת רק את המשימות שמתוכננות להסתיים עד שנת הייחוס, והיעד הוא לאותה שנה.
  const targets = useMemo(() => channelTargets(supply, baseYear, trackingYear), [supply, baseYear, trackingYear]);
  const due = useMemo(
    () => tasksDueBy(data.projects.filter(matches), trackingYear),
    [data.projects, matches, trackingYear],
  );
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
  const filtered = useMemo(
    () => ordered.filter((p) => (channelFilter.length === 0 || channelFilter.includes(p.channel)) && matches(p)),
    [ordered, channelFilter, matches],
  );

  const owners = useMemo(
    () => [...new Set(data.projects.map((p) => p.owner).filter(Boolean))].sort(),
    [data.projects],
  );
  const channelOptions = useMemo(
    () => supply.sources.map((s) => ({ value: s.key, label: s.label })),
    [supply.sources],
  );
  const onSelect = useCallback(
    (id: string) => setEditing(data.projects.find((p) => p.id === id) ?? null),
    [data.projects],
  );

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
            data={PROJECT_STATUSES.map((s) => ({ value: s, label: t.statuses[s] }))}
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
        footer={`${t.statusRule(ON_TRACK_TOLERANCE, AT_RISK_TOLERANCE)} ${t.cardHint} ${t.sampleProjects}`}
      >
        {/* שורות המקורות ותיבות ה-KPI נשארות גם כשאין משימה שמתאימה לסינון. */}
        {filtered.length === 0 && (
          <Text c="dimmed" ta="center" size="sm" py="xs">
            {t.noProjects}
          </Text>
        )}
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
          onSelect={onSelect}
        />
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

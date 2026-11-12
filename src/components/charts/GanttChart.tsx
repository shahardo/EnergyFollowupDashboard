import { useComputedColorScheme } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { CustomChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { forwardRef, useMemo, useRef, type ReactNode } from 'react';
import { he } from '../../i18n/he';
import {
  PROJECT_STATUSES,
  assignLanes,
  expectedProgress,
  formatDate,
  parseDate,
  projectedEnd,
  projectStatus,
} from '../../model/projects';
import type { Project, ProjectStatus } from '../../schema';
import { escapeHtml, fmt, ltr } from '../../utils/format';
import { BASE_OPTION, textWidth, themeColors, useChartPng, type ChartHandle } from './echartsCore';
import { pattern } from './patterns';

echarts.use([CustomChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

/** צבע לכל סטטוס: מסגרת התיבה, פס ההתקדמות וגלולות ה-KPI. */
const statusColors: Record<ProjectStatus, string> = {
  'on-track': '#2f9e44',
  'at-risk': '#f08c00',
  delayed: '#e03131',
};

/** מקור אנרגיה (קבוצת שורות בגאנט) ומדדי הביצוע שלו לתיבת ה-KPI שבראש השורה. */
export interface GanttSource {
  key: string;
  label: string;
  /** התקדמות המשימות שמתוכננות להסתיים עד שנת הייחוס (0..100), או null כשאין. */
  progressPct: number | null;
  counts: Record<ProjectStatus, number>;
  /** ההספק החדש שתרחיש ההיצע דורש במקור עד שנת הייחוס. */
  targetGW: number;
}

interface Props {
  /** המשימות שעברו את הסינון. */
  tasks: Project[];
  /** מקורות האנרגיה (שורות הגאנט), בסדר של לוח ההיצע. */
  sources: GanttSource[];
  /** שנת הייחוס של תיבות ה-KPI. */
  targetYear: number;
  asOf: string;
  channelColor: (key: string) => string;
  onSelect: (id: string) => void;
  /** פקד שמצויר מעל עמודת תיבות ה-KPI (בחירת שנת הייחוס). */
  corner?: (narrow: boolean) => ReactNode;
}

/** גובה נתיב (פיקסלים). */
const ROW = 30;
/** מרווח עליון: תוויות ציר הזמן מעל הגאנט, והפקד שמעל עמודת ה-KPI. */
const TOP = 48;
/** כל מקור תופס לפחות שני נתיבים, כדי שתיבת ה-KPI (שתי שורות) תיכנס. */
const MIN_LANES = 2;
const DAY = 86_400_000;
const YEAR = 365 * DAY;
/** מרווח בקצוות ציר הזמן. */
const TIME_PAD = 60 * DAY;

// הטיפוסים של renderItem ב-ECharts (רק מה שבשימוש).
type Rect = { x: number; y: number; width: number; height: number };
type Api = {
  value: (i: number) => number;
  coord: (v: [number, number]) => [number, number];
  size: (v: [number, number]) => [number, number];
};
type Params = { coordSys: Rect; dataIndex: number };

/**
 * גאנט מקורות אנרגיה: קבוצת שורות לכל מקור, ובה תיבות משימה עם שמן. משימות חופפות עוברות לנתיב נוסף.
 * בראש כל קבוצה (מימין) תיבת KPI ותיבת יעד מסובבת, מצוירות בתוך הקנבס כדי שייכנסו ל-PNG.
 * שלוש סדרות custom: רקע מתחלף לכל מקור, תיבות ה-KPI (id: kpi) ותיבות המשימה (id: tasks) עם קו "נכון ל-".
 */
export const GanttChart = forwardRef<ChartHandle, Props>(function GanttChart(
  { tasks, sources, targetYear, asOf, channelColor, onSelect, corner },
  ref,
) {
  const dark = useComputedColorScheme('light') === 'dark';
  const chartRef = useRef<ReactEChartsCore>(null);
  const { ref: boxRef, width } = useElementSize();
  // במסך צר: שמות קצרים יותר ותוויות קטנות, כדי שלתיבות יישאר מקום.
  const narrow = width > 0 && width < 600;
  // תיבת ה-KPI (מימין) ותיבת היעד המסובבת (משמאלה), מחוץ לשטח הגאנט.
  const kpiW = narrow ? 132 : 230;
  const targetW = narrow ? 20 : 24;
  const gap = narrow ? 4 : 6;
  const gutter = gap + targetW + 4 + kpiW + 2;
  useChartPng(ref, chartRef, dark);
  // הלחיצה קוראת את onSelect העדכני דרך ref, כדי ש-onEvents יישאר יציב: echarts-for-react
  // משמיד ובונה מחדש את הגרף כש-onEvents משתנה.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onEvents = useMemo(
    () => ({
      click: (p: { seriesId?: string; data?: { id?: string } }) =>
        p.seriesId === 'tasks' && p.data?.id && onSelectRef.current(p.data.id),
    }),
    [],
  );

  // ── פריסה: נתיב לכל משימה, וטווח השורות של כל מקור ──────────────────────
  const layout = useMemo(() => {
    const lanes = assignLanes(tasks, asOf);
    // מספר הנתיבים של כל מקור, במעבר אחד על המשימות.
    const laneCount = new Map<string, number>();
    for (const t of tasks) laneCount.set(t.channel, Math.max(laneCount.get(t.channel) ?? 0, (lanes.get(t.id) ?? 0) + 1));
    const rowIds: string[] = [];
    const groups: { first: number; last: number; source: GanttSource }[] = [];
    const firstRow = new Map<string, number>();
    for (const s of sources) {
      const n = Math.max(MIN_LANES, laneCount.get(s.key) ?? 0);
      firstRow.set(s.key, rowIds.length);
      groups.push({ first: rowIds.length, last: rowIds.length + n - 1, source: s });
      for (let l = 0; l < n; l++) rowIds.push(`${s.key}#${l}`);
    }
    const visible = tasks.filter((t) => firstRow.has(t.channel));
    return { lanes, rowIds, groups, firstRow, visible };
  }, [tasks, sources, asOf]);

  const option = useMemo(() => {
    const { lanes, rowIds, groups, firstRow, visible } = layout;
    const { text, boxText, grid } = themeColors(dark);
    const sourceLabel = new Map(sources.map((s) => [s.key, s.label]));
    const now = parseDate(asOf);
    const rows = visible.map((p) => {
      const start = parseDate(p.plannedStart);
      const end = parseDate(p.plannedEnd);
      const projected = projectedEnd(p, asOf);
      const row = firstRow.get(p.channel)! + (lanes.get(p.id) ?? 0);
      return {
        id: p.id,
        value: [row, start, end, start + ((end - start) * p.progressPct) / 100, projected ?? -1],
        status: projectStatus(p, asOf),
        project: p,
      };
    });
    // ── ציר הזמן ──────────────────────────────────────────────────────────
    const plannedMax = Math.max(now, ...rows.map((r) => r.value[2]));
    // סיום צפוי רחוק מאוד (קצב איטי מאוד) לא מותח את הציר: הפס המקווקו נחתך בקצה.
    const allTimes = rows.flatMap((r) => [r.value[1], Math.min(Math.max(r.value[2], r.value[4]), plannedMax + 2 * YEAR), now]);
    const min = allTimes.length ? Math.min(...allTimes) - TIME_PAD : now - YEAR;
    const max = allTimes.length ? Math.max(...allTimes) + TIME_PAD : now + YEAR;

    const band = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

    return {
      ...BASE_OPTION,
      grid: { left: narrow ? 4 : 12, right: gutter, top: TOP, bottom: 8, containLabel: false },
      tooltip: {
        trigger: 'item',
        confine: true,
        // שמות המשימות, הגורמים והמקורות מגיעים מקבצים: מנוטרלים לפני שנכנסים ל-HTML של הטולטיפ.
        formatter: (params: { seriesId: string; dataIndex: number; data: (typeof rows)[number] }) => {
          const t = he.tracking;
          if (params.seriesId === 'kpi') {
            const s = groups[params.dataIndex].source;
            const n = s.counts['on-track'] + s.counts['at-risk'] + s.counts.delayed;
            return [
              `<b>${escapeHtml(s.label)}</b>`,
              n > 0 ? t.tasksCount(n) : t.noTasks,
              ...PROJECT_STATUSES.filter((st) => s.counts[st] > 0).map(
                (st) => `<span style="color:${statusColors[st]}">● ${t.statuses[st]} ${s.counts[st]}</span>`,
              ),
              `${t.taskProgress}: ${s.progressPct === null ? '–' : `${Math.round(s.progressPct)}%`}`,
              s.targetGW > 0 ? t.targetLine(fmt(s.targetGW), targetYear) : t.noTarget,
            ].join('<br/>');
          }
          if (params.seriesId !== 'tasks') return '';
          const { project: p, status, value } = params.data;
          const exp = expectedProgress(p, asOf);
          const proj = value[4] > 0 ? formatDate(value[4]) : t.cannotEstimate;
          const src = escapeHtml(sourceLabel.get(p.channel) ?? p.channel);
          return [
            `<b>${escapeHtml(p.name)}</b>`,
            p.owner ? `${src} · ${escapeHtml(p.owner)}` : src,
            `${t.planned}: ${p.plannedStart} – ${p.plannedEnd}`,
            `${t.progress}: ${p.progressPct}% (${t.expected} ${exp.toFixed(0)}%)`,
            `${t.projectedEnd}: ${proj}`,
            `<span style="color:${statusColors[status]}">● ${t.statuses[status]}</span>`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'time',
        min,
        max,
        position: 'top',
        axisLabel: { color: text, hideOverlap: true, fontSize: narrow ? 10 : 12 },
        axisLine: { lineStyle: { color: grid } },
        splitLine: { show: true, lineStyle: { color: grid } },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        position: 'right',
        data: rowIds,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { show: false },
      },
      // ── הסדרות ─────────────────────────────────────────────────────────────
      series: [
        {
          // רקע מתחלף לכל מקור, כדי שכמה נתיבים של אותו מקור ייקראו כקבוצה אחת.
          type: 'custom',
          silent: true,
          z: 0,
          encode: { y: 0 },
          data: groups.map((g, i) => [g.first, g.last, i]),
          renderItem: (params: Params, api: Api) => {
            const cs = params.coordSys;
            const half = api.size([0, 1])[1] / 2;
            const [, y0] = api.coord([min, api.value(0)]);
            const [, y1] = api.coord([min, api.value(1)]);
            const top = y0 - half;
            const children: object[] = [
              {
                type: 'line',
                shape: { x1: cs.x, y1: top, x2: cs.x + cs.width + gutter, y2: top },
                style: { stroke: grid, lineWidth: 1 },
              },
            ];
            if (api.value(2) % 2 === 1)
              children.push({
                type: 'rect',
                shape: { x: cs.x, y: top, width: cs.width, height: y1 + half - top },
                style: { fill: band },
              });
            return { type: 'group', children };
          },
        },
        {
          // תיבת KPI לכל מקור, בצד ימין במקום שם המקור, ומשמאלה תיבת יעד ההספק המסובבת.
          id: 'kpi',
          type: 'custom',
          z: 3,
          clip: false,
          encode: { y: 0 },
          data: groups.map((g, i) => [g.first, g.last, i]),
          renderItem: (params: Params, api: Api) => {
            const cs = params.coordSys;
            const s = groups[params.dataIndex].source;
            const half = api.size([0, 1])[1] / 2;
            const [, y0] = api.coord([min, api.value(0)]);
            const [, y1] = api.coord([min, api.value(1)]);
            const top = y0 - half + 3;
            const h = y1 + half - 3 - top;
            const tx = cs.x + cs.width + gap;
            const bx = tx + targetW + 4;
            const right = bx + kpiW;
            const pad = narrow ? 6 : 8;
            const boxFill = dark ? '#2c2e33' : '#ffffff';
            const worst = s.counts.delayed > 0 ? 'delayed' : s.counts['at-risk'] > 0 ? 'at-risk' : 'on-track';
            const tone = s.progressPct === null ? '#868e96' : statusColors[worst];
            const children: object[] = [
              { type: 'rect', shape: { x: bx, y: top, width: kpiW, height: h, r: 6 }, style: { fill: boxFill, stroke: grid, lineWidth: 1 } },
              { type: 'rect', shape: { x: tx, y: top, width: targetW, height: h, r: 6 }, style: { fill: boxFill, stroke: grid, lineWidth: 1 } },
            ];
            // שורה 1 (צמודה לראש התיבה): ריבוע צבע ושם (מימין), גלולות סטטוס (משמאל).
            const l1 = top + pad + 8;
            const sq = 10;
            children.push({
              type: 'rect',
              silent: true,
              shape: { x: right - pad - sq, y: l1 - sq / 2, width: sq, height: sq, r: 2 },
              style: { fill: channelColor(s.key) },
            });
            const pillFs = narrow ? 9 : 10;
            const pillH = narrow ? 14 : 16;
            let px = bx + pad;
            for (const st of PROJECT_STATUSES) {
              const n = s.counts[st];
              if (n <= 0) continue;
              const label = narrow ? String(n) : `${he.tracking.statuses[st]} ${n}`;
              const w = textWidth(label, pillFs, 700) + (narrow ? 8 : 12);
              children.push(
                {
                  type: 'rect',
                  silent: true,
                  shape: { x: px, y: l1 - pillH / 2, width: w, height: pillH, r: pillH / 2 },
                  style: { fill: `${statusColors[st]}${dark ? '40' : '24'}` },
                },
                {
                  type: 'text',
                  silent: true,
                  style: {
                    text: label,
                    x: px + w / 2,
                    y: l1,
                    align: 'center',
                    verticalAlign: 'middle',
                    fill: statusColors[st],
                    fontSize: pillFs,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                  },
                },
              );
              px += w + 3;
            }
            const nameRight = right - pad - sq - 5;
            children.push({
              type: 'text',
              silent: true,
              style: {
                text: s.label,
                x: nameRight,
                y: l1,
                align: 'right',
                verticalAlign: 'middle',
                width: Math.max(10, nameRight - px - 4),
                overflow: 'truncate',
                ellipsis: '…',
                fill: boxText,
                fontSize: narrow ? 12 : 14,
                fontWeight: 600,
                fontFamily: 'inherit',
              },
            });
            // שורה 2: אחוז הביצוע (מימין) והבאר באותה שורה.
            const l2 = l1 + 24;
            const pct = s.progressPct === null ? '–' : `${Math.round(s.progressPct)}%`;
            const pctFs = narrow ? 12 : 14;
            const pctW = Math.max(textWidth('100%', pctFs, 700), textWidth(pct, pctFs, 700));
            children.push({
              type: 'text',
              silent: true,
              style: {
                text: pct,
                x: right - pad,
                y: l2,
                align: 'right',
                verticalAlign: 'middle',
                fill: tone,
                fontSize: pctFs,
                fontWeight: 700,
                fontFamily: 'inherit',
              },
            });
            const barR = right - pad - pctW - 6;
            const barW = Math.max(0, barR - (bx + pad));
            const fillW = (barW * (s.progressPct ?? 0)) / 100;
            children.push(
              {
                type: 'rect',
                silent: true,
                shape: { x: bx + pad, y: l2 - 3, width: barW, height: 6, r: 3 },
                style: { fill: dark ? '#373a40' : '#e9ecef' },
              },
              {
                type: 'rect',
                silent: true,
                shape: { x: barR - fillW, y: l2 - 3, width: fillW, height: 6, r: 3 },
                style: { fill: tone },
              },
            );
            // תיבת היעד: ההספק החדש עד שנת הייחוס, מסובב 90 מעלות.
            children.push({
              type: 'text',
              silent: true,
              x: tx + targetW / 2,
              y: top + h / 2,
              rotation: Math.PI / 2,
              style: {
                text: s.targetGW > 0 ? ltr(`+${fmt(s.targetGW)} GW`) : '–',
                x: 0,
                y: 0,
                align: 'center',
                verticalAlign: 'middle',
                width: h - 6,
                overflow: 'truncate',
                ellipsis: '…',
                fill: s.targetGW > 0 ? boxText : '#868e96',
                fontSize: narrow ? 10 : 11,
                fontWeight: 600,
                fontFamily: 'inherit',
              },
            });
            return { type: 'group', children };
          },
        },
        {
          id: 'tasks',
          type: 'custom',
          z: 2,
          encode: { x: [1, 2, 3, 4], y: 0 },
          data: rows,
          renderItem: (params: Params, api: Api) => {
            const row = api.value(0);
            const [x0, yMid] = api.coord([api.value(1), row]);
            const [x1] = api.coord([api.value(2), row]);
            const [xp] = api.coord([api.value(3), row]);
            const projected = api.value(4);
            const h = Math.min(api.size([0, 1])[1] * 0.76, 24);
            const y = yMid - h / 2;
            const { status, project } = rows[params.dataIndex];
            const color = statusColors[status];
            const fill = channelColor(project.channel);
            const cs = params.coordSys;
            const clip = (r: Rect) => echarts.graphic.clipRectByRect(r, cs);
            const children: object[] = [];
            if (projected > 0) {
              const [xe] = api.coord([projected, row]);
              const ext = clip({ x: x1, y, width: xe - x1, height: h });
              if (ext && ext.width > 1)
                children.push({
                  type: 'rect',
                  shape: { ...ext, r: 3 },
                  style: { fill: 'transparent', stroke: color, lineWidth: 1, lineDash: [4, 3], opacity: 0.8 },
                });
            }
            const box = clip({ x: x0, y, width: Math.max(2, x1 - x0), height: h });
            if (!box) return { type: 'group', children };
            children.push({
              type: 'rect',
              shape: { ...box, r: 3 },
              style: { fill, opacity: dark ? 0.32 : 0.22 },
            });
            const prog = clip({ x: x0, y: y + h - 5, width: Math.max(0, xp - x0), height: 4 });
            if (prog && prog.width > 0)
              children.push({ type: 'rect', shape: { ...prog, r: 1 }, style: { fill: pattern(color) } });
            children.push({
              type: 'rect',
              shape: { ...box, r: 3 },
              style: { fill: 'transparent', stroke: color, lineWidth: 1.3 },
            });
            if (box.width >= 24)
              children.push({
                type: 'text',
                silent: true,
                style: {
                  text: project.name,
                  x: box.x + box.width / 2,
                  y: yMid - 1,
                  align: 'center',
                  verticalAlign: 'middle',
                  width: box.width - 8,
                  overflow: 'truncate',
                  ellipsis: '…',
                  fill: boxText,
                  fontSize: narrow ? 10 : 11,
                  fontFamily: 'inherit',
                },
              });
            return { type: 'group', children };
          },
          markLine: {
            symbol: 'none',
            silent: true,
            // מעל שורת השנים של הציר, לא עליה.
            label: {
              show: !narrow,
              formatter: `${he.tracking.asOf} ${asOf}`,
              color: text,
              position: 'start',
              distance: 24,
            },
            lineStyle: { color: dark ? '#ff8787' : '#c92a2a', type: 'solid', width: 1.5 },
            data: [{ xAxis: now }],
          },
        },
      ],
    };
  }, [layout, sources, targetYear, asOf, dark, channelColor, narrow, gutter, gap, targetW, kpiW]);

  const height = Math.max(160, layout.rowIds.length * ROW + TOP + 22);
  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {corner && (
        <div
          style={{
            // מעל עמודת תיבות ה-KPI; הכפתורים בקצה השמאלי שלה, 10px מעל התיבה הראשונה (שמתחילה ב-TOP + 3).
            position: 'absolute',
            top: 0,
            right: 2,
            width: narrow ? gutter - 2 : kpiW,
            height: TOP - 7,
            zIndex: 1,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          {corner(narrow)}
        </div>
      )}
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={option}
        notMerge
        style={{ height, width: '100%' }}
        onEvents={onEvents}
      />
    </div>
  );
});

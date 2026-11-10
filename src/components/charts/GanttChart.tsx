import { useComputedColorScheme } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { CustomChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { he } from '../../i18n/he';
import { assignLanes, expectedProgress, parseDate, projectedEnd, projectStatus } from '../../model/projects';
import type { Project, ProjectStatus } from '../../schema';
import { pattern } from './patterns';
import type { ChartHandle } from './StackedAreaChart';

echarts.use([CustomChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export const statusColors: Record<ProjectStatus, string> = {
  'on-track': '#2f9e44',
  'at-risk': '#f08c00',
  delayed: '#e03131',
};

interface Props {
  /** המשימות שעברו את הסינון. */
  tasks: Project[];
  /** מקורות האנרגיה (שורות הגאנט), בסדר של לוח ההיצע. */
  sources: { key: string; label: string }[];
  asOf: string;
  channelColor: (key: string) => string;
  onSelect: (id: string) => void;
}

const ROW = 30;
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Rect = { x: number; y: number; width: number; height: number };
type Api = {
  value: (i: number) => number;
  coord: (v: [number, number]) => [number, number];
  size: (v: [number, number]) => [number, number];
};
type Params = { coordSys: Rect; dataIndex: number };

/** גאנט מקורות אנרגיה: קבוצת שורות לכל מקור, ובה תיבות משימה עם שמן. משימות חופפות עוברות לנתיב נוסף. */
export const GanttChart = forwardRef<ChartHandle, Props>(function GanttChart(
  { tasks, sources, asOf, channelColor, onSelect },
  ref,
) {
  const dark = useComputedColorScheme('light') === 'dark';
  const chartRef = useRef<ReactEChartsCore>(null);
  const { ref: boxRef, width } = useElementSize();
  // במסך צר: שמות קצרים יותר ותוויות קטנות, כדי שלתיבות יישאר מקום.
  const narrow = width > 0 && width < 600;
  const maxName = narrow ? 12 : 24;
  useImperativeHandle(
    ref,
    () => ({
      toPng: () =>
        chartRef.current
          ?.getEchartsInstance()
          .getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: dark ? '#242424' : '#ffffff' }) ?? null,
    }),
    [dark],
  );

  const layout = useMemo(() => {
    const lanes = assignLanes(tasks, asOf);
    const rowIds: string[] = [];
    const rowLabel = new Map<string, { key: string; label: string } | null>();
    const groups: { first: number; last: number }[] = [];
    const firstRow = new Map<string, number>();
    for (const s of sources) {
      let n = 1;
      for (const t of tasks) if (t.channel === s.key) n = Math.max(n, (lanes.get(t.id) ?? 0) + 1);
      firstRow.set(s.key, rowIds.length);
      groups.push({ first: rowIds.length, last: rowIds.length + n - 1 });
      for (let l = 0; l < n; l++) {
        const id = `${s.key}#${l}`;
        rowIds.push(id);
        rowLabel.set(id, l === 0 ? s : null);
      }
    }
    const visible = tasks.filter((t) => firstRow.has(t.channel));
    return { lanes, rowIds, rowLabel, groups, firstRow, visible };
  }, [tasks, sources, asOf]);

  const option = useMemo(() => {
    const { lanes, rowIds, rowLabel, groups, firstRow, visible } = layout;
    const text = dark ? '#c9c9c9' : '#495057';
    const boxText = dark ? '#f1f3f5' : '#212529';
    const grid = dark ? '#373a40' : '#e9ecef';
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
    const YEAR = 365 * 86_400_000;
    const pad = 60 * 86_400_000;
    const plannedMax = Math.max(now, ...rows.map((r) => r.value[2]));
    // סיום צפוי רחוק מאוד (קצב איטי מאוד) לא מותח את הציר: הפס המקווקו נחתך בקצה.
    const allTimes = rows.flatMap((r) => [r.value[1], Math.min(Math.max(r.value[2], r.value[4]), plannedMax + 2 * YEAR), now]);
    const min = allTimes.length ? Math.min(...allTimes) - pad : now - YEAR;
    const max = allTimes.length ? Math.max(...allTimes) + pad : now + YEAR;

    const fs = narrow ? 11 : 12;
    const rich: Record<string, object> = { name: { color: text, fontSize: fs, fontWeight: 600 } };
    for (const s of sources) rich[`c_${s.key}`] = { color: channelColor(s.key), fontSize: fs };
    const band = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

    return {
      backgroundColor: 'transparent',
      animationDuration: 300,
      animationDurationUpdate: 200,
      textStyle: { fontFamily: 'inherit' },
      grid: { left: narrow ? 4 : 12, right: narrow ? 4 : 12, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: { seriesIndex: number; data: (typeof rows)[number] }) => {
          if (params.seriesIndex !== 1) return '';
          const { project: p, status, value } = params.data;
          const t = he.tracking;
          const exp = expectedProgress(p, asOf);
          const proj = value[4] > 0 ? fmtDate(value[4]) : t.cannotEstimate;
          const src = sources.find((s) => s.key === p.channel)?.label ?? p.channel;
          return [
            `<b>${p.name}</b>`,
            p.owner ? `${src} · ${p.owner}` : src,
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
        axisLabel: {
          interval: 0,
          formatter: (id: string) => {
            const s = rowLabel.get(id);
            if (!s) return '';
            const name = s.label.length > maxName ? s.label.slice(0, maxName - 1) + '…' : s.label;
            return `{c_${s.key}|■} {name|${name}}`;
          },
          rich,
        },
      },
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
                shape: { x1: cs.x, y1: top, x2: cs.x + cs.width, y2: top },
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
            label: { show: !narrow, formatter: `${he.tracking.today} ${asOf}`, color: text, position: 'start' },
            lineStyle: { color: dark ? '#ff8787' : '#c92a2a', type: 'solid', width: 1.5 },
            data: [{ xAxis: now }],
          },
        },
      ],
    };
  }, [layout, sources, asOf, dark, channelColor, narrow, maxName]);

  const height = Math.max(160, layout.rowIds.length * ROW + 50);
  return (
    <div ref={boxRef}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={option}
        notMerge
        style={{ height, width: '100%' }}
        onEvents={{
          click: (p: { seriesIndex?: number; data?: { id?: string } }) =>
            p.seriesIndex === 1 && p.data?.id && onSelect(p.data.id),
        }}
      />
    </div>
  );
});

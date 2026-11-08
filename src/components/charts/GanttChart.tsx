import { useComputedColorScheme } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { CustomChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { he } from '../../i18n/he';
import { expectedProgress, parseDate, projectedEnd, projectStatus } from '../../model/projects';
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
  projects: Project[];
  asOf: string;
  channelLabel: (key: string) => string;
  channelColor: (key: string) => string;
  onSelect: (id: string) => void;
}

const ROW = 34;
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const GanttChart = forwardRef<ChartHandle, Props>(function GanttChart(
  { projects, asOf, channelLabel, channelColor, onSelect },
  ref,
) {
  const dark = useComputedColorScheme('light') === 'dark';
  const chartRef = useRef<ReactEChartsCore>(null);
  const { ref: boxRef, width } = useElementSize();
  // במסך צר: שמות קצרים יותר ותוויות קטנות, כדי שלפסים יישאר מקום.
  const narrow = width > 0 && width < 600;
  const maxName = narrow ? 14 : 30;
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

  const option = useMemo(() => {
    const text = dark ? '#c9c9c9' : '#495057';
    const grid = dark ? '#373a40' : '#e9ecef';
    const now = parseDate(asOf);
    const rows = projects.map((p, i) => {
      const start = parseDate(p.plannedStart);
      const end = parseDate(p.plannedEnd);
      const projected = projectedEnd(p, asOf);
      return {
        id: p.id,
        value: [i, start, end, start + ((end - start) * p.progressPct) / 100, projected ?? -1],
        status: projectStatus(p, asOf),
        project: p,
      };
    });
    const allTimes = rows.flatMap((r) => [r.value[1], Math.max(r.value[2], r.value[4]), now]);
    const pad = 45 * 86_400_000;
    const min = allTimes.length ? Math.min(...allTimes) - pad : now - 365 * 86_400_000;
    const max = allTimes.length ? Math.max(...allTimes) + pad : now + 365 * 86_400_000;

    const fs = narrow ? 11 : 12;
    const rich: Record<string, object> = { name: { color: text, fontSize: fs } };
    for (const p of projects) rich[`c_${p.channel}`] = { color: channelColor(p.channel), fontSize: fs };

    return {
      backgroundColor: 'transparent',
      animationDuration: 300,
      animationDurationUpdate: 200,
      textStyle: { fontFamily: 'inherit' },
      grid: { left: narrow ? 4 : 12, right: narrow ? 4 : 12, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: { data: (typeof rows)[number] }) => {
          const { project: p, status, value } = params.data;
          const t = he.tracking;
          const exp = expectedProgress(p, asOf);
          const proj = value[4] > 0 ? fmtDate(value[4]) : t.cannotEstimate;
          return [
            `<b>${p.name}</b>`,
            `${channelLabel(p.channel)} · ${p.mw.toLocaleString('he-IL')} MW · ${p.owner}`,
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
        data: projects.map((p) => p.id),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          formatter: (id: string) => {
            const p = projects.find((x) => x.id === id);
            return p
              ? `{c_${p.channel}|■} {name|${p.name.length > maxName ? p.name.slice(0, maxName - 1) + '…' : p.name}}`
              : id;
          },
          rich,
        },
      },
      series: [
        {
          type: 'custom',
          encode: { x: [1, 2, 3, 4], y: 0 },
          data: rows,
          renderItem: (
            params: { coordSys: { x: number; y: number; width: number; height: number }; dataIndex: number },
            api: {
              value: (i: number) => number;
              coord: (v: [number, number]) => [number, number];
              size: (v: [number, number]) => [number, number];
            },
          ) => {
            const row = api.value(0);
            const [x0, yMid] = api.coord([api.value(1), row]);
            const [x1] = api.coord([api.value(2), row]);
            const [xp] = api.coord([api.value(3), row]);
            const projected = api.value(4);
            const h = Math.min(api.size([0, 1])[1] * 0.56, 20);
            const y = yMid - h / 2;
            const status = rows[params.dataIndex].status;
            const color = statusColors[status];
            const cs = params.coordSys;
            const clip = (r: { x: number; y: number; width: number; height: number }) =>
              echarts.graphic.clipRectByRect(r, cs);
            const children: object[] = [];
            const planned = clip({ x: x0, y, width: Math.max(2, x1 - x0), height: h });
            if (planned)
              children.push({
                type: 'rect',
                shape: { ...planned, r: 3 },
                style: { fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', stroke: color, lineWidth: 1.5 },
              });
            const prog = clip({ x: x0, y: y + 3, width: Math.max(0, xp - x0), height: h - 6 });
            if (prog && prog.width > 0)
              children.push({
                type: 'rect',
                shape: { ...prog, r: 2 },
                style: { fill: pattern(color) },
              });
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
  }, [projects, asOf, dark, channelLabel, channelColor, narrow, maxName]);

  const height = Math.max(160, projects.length * ROW + 60);
  return (
    <div ref={boxRef}>
    <ReactEChartsCore
      ref={chartRef}
      echarts={echarts}
      option={option}
      notMerge
      style={{ height, width: '100%' }}
      onEvents={{ click: (p: { data?: { id?: string } }) => p.data?.id && onSelect(p.data.id) }}
    />
    </div>
  );
});

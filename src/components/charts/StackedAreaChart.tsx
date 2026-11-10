import { useComputedColorScheme } from '@mantine/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { legendTextCap, splitLegend } from './legend';
import { pattern } from './patterns';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export interface AreaSeries {
  name: string;
  values: number[];
  color?: string;
}

interface Props {
  years: number[];
  stacked: AreaSeries[];
  /** קו מקווקו שלא נערם, למשל הביקוש. */
  line?: AreaSeries;
  /** שכבה אדומה שנערמת מעל ההיצע עד קו הביקוש. */
  gap?: AreaSeries;
  /** קווי השוואה מקווקווים (תרחיש שנטען להשוואה). */
  compare?: AreaSeries[];
  /** קו רציף במקום מקווקו (למשל ביקוש נטו בגרף הביקוש). */
  lineSolid?: boolean;
  /**
   * פס ההפחתות בראש הערימה: מהביקוש נטו (net) ועד הביקוש ברוטו, בשכבות (layers).
   * מצויר כמילוי בצבע הרקע עם פסים, כך שראש העקומה נראה "חתוך".
   */
  reduction?: { net: number[]; layers: AreaSeries[] };
  unit: string;
  targetYear: number;
  height?: number;
}

const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));

export interface ChartHandle {
  /** תמונת PNG של הגרף, ברזולוציה כפולה ועם רקע אטום. */
  toPng: () => string | null;
}

export const COMPARE_COLOR = '#1c7ed6';
const BG = { light: '#ffffff', dark: '#242424' };

/** מידות המקרא: גופן, סמל ורווחים (פיקסלים). */
const LEGEND = { fontSize: 11, itemWidth: 14, itemHeight: 10, iconGap: 5, itemGap: 10, rowHeight: 18, sidePad: 8 };

/** הגופן של המקרא: אותו גופן משמש גם למדידה, כדי שהחישוב יתאים לציור. */
const legendFont = () =>
  typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily || 'sans-serif' : 'sans-serif';

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** רוחב טקסט בפיקסלים בגופן של המקרא (מעוגל למעלה, עם מרווח ביטחון קטן). */
function textWidth(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (!measureCtx) return text.length * LEGEND.fontSize * 0.6;
  measureCtx.font = `${LEGEND.fontSize}px ${legendFont()}`;
  return Math.ceil(measureCtx.measureText(text).width) + 2;
}

export const StackedAreaChart = forwardRef<ChartHandle, Props>(function StackedAreaChart(
  { years, stacked, line, gap, compare, lineSolid, reduction, unit, targetYear, height = 380 },
  ref,
) {
  const dark = useComputedColorScheme('light') === 'dark';
  const chartRef = useRef<ReactEChartsCore>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // רוחב הגרף, כדי שכל שורת מקרא תיכנס בשורה אחת.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      toPng: () =>
        chartRef.current
          ?.getEchartsInstance()
          .getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: dark ? BG.dark : BG.light }) ?? null,
    }),
    [dark],
  );
  const option = useMemo(() => {
    const text = dark ? '#c9c9c9' : '#495057';
    const grid = dark ? '#373a40' : '#e9ecef';
    const series: object[] = stacked.map((s, i) => ({
      name: s.name,
      type: 'line',
      stack: 'total',
      areaStyle: { opacity: 0.85 },
      lineStyle: { width: 0.5 },
      symbol: 'none',
      color: s.color,
      emphasis: { focus: 'series' },
      data: s.values,
      ...(i === 0
        ? {
            markLine: {
              symbol: 'none',
              silent: true,
              label: { formatter: String(targetYear), color: text },
              lineStyle: { color: text, type: 'solid', width: 1 },
              data: [{ xAxis: String(targetYear) }],
            },
          }
        : {}),
    }));
    if (gap) {
      series.push({
        name: gap.name,
        type: 'line',
        stack: 'total',
        areaStyle: { opacity: 0.55 },
        lineStyle: { width: 0 },
        symbol: 'none',
        color: gap.color ?? '#e03131',
        data: gap.values,
      });
    }
    if (reduction && reduction.layers.some((l) => l.values.some((v) => v > 1e-9))) {
      const bg = dark ? BG.dark : BG.light;
      // בסיס בלתי נראה בגובה הביקוש נטו, ומעליו שכבות ההפחתה.
      series.push({
        name: '__net_base',
        type: 'line',
        stack: 'reduction',
        symbol: 'none',
        lineStyle: { width: 0 },
        areaStyle: { opacity: 0 },
        data: reduction.net,
        silent: true,
        tooltip: { show: false },
        z: 5,
      });
      for (const l of reduction.layers) {
        series.push({
          name: l.name,
          type: 'line',
          stack: 'reduction',
          symbol: 'none',
          color: l.color,
          lineStyle: { width: 1, type: 'dashed', color: l.color },
          areaStyle: { color: pattern(l.color ?? text, bg, 0.82), opacity: 1 },
          data: l.values,
          z: 6,
        });
      }
    }
    if (line) {
      series.push({
        name: line.name,
        type: 'line',
        symbol: 'none',
        color: line.color ?? text,
        lineStyle: { type: lineSolid ? 'solid' : 'dashed', width: 2 },
        data: line.values,
        z: 10,
      });
    }
    for (const c of compare ?? []) {
      series.push({
        name: c.name,
        type: 'line',
        symbol: 'none',
        color: c.color ?? COMPARE_COLOR,
        lineStyle: { type: [6, 4], width: 2 },
        data: c.values,
        z: 11,
      });
    }
    return {
      backgroundColor: 'transparent',
      animationDuration: 300,
      animationDurationUpdate: 200,
      textStyle: { fontFamily: 'inherit' },
      tooltip: {
        trigger: 'axis',
        formatter: (items: { seriesName: string; value: number | null; marker: string; axisValueLabel: string }[]) => {
          const rows = items
            .filter((i) => !i.seriesName.startsWith('__') && i.value !== null && i.value !== undefined)
            .map((i) => `${i.marker} ${i.seriesName}: <b>${fmt(i.value as number)}</b> ${unit}`);
          return [`<b>${items[0]?.axisValueLabel ?? ''}</b>`, ...rows].join('<br/>');
        },
      },
      // שתי שורות מקרא מתחת לגרף. טקסט ארוך מדי מקוצר (השם המלא בריחוף), כדי שכל שורה תישאר אחת.
      legend: splitLegend(series.map((x) => (x as { name: string }).name).filter((n) => !n.startsWith('__'))).map(
        (names, row) => {
          const cap =
            width > 0
              ? legendTextCap(
                  names.map(textWidth),
                  width - 2 * LEGEND.sidePad,
                  LEGEND.itemWidth + LEGEND.iconGap + LEGEND.itemGap,
                )
              : null;
          return {
            type: 'plain',
            show: names.length > 0,
            left: 'center',
            bottom: row === 0 ? LEGEND.rowHeight + 4 : 4,
            itemWidth: LEGEND.itemWidth,
            itemHeight: LEGEND.itemHeight,
            itemGap: LEGEND.itemGap,
            padding: [0, LEGEND.sidePad],
            textStyle: { color: text, fontSize: LEGEND.fontSize, fontFamily: legendFont() },
            tooltip: { show: cap !== null },
            data: names.map((name) =>
              cap !== null && textWidth(name) > cap
                ? { name, textStyle: { width: cap, overflow: 'truncate' } }
                : { name },
            ),
          };
        },
      ),
      grid: { left: 8, right: 16, top: 28, bottom: 2 * LEGEND.rowHeight + 16, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: years.map(String),
        axisLabel: { color: text },
        axisLine: { lineStyle: { color: grid } },
      },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: { color: text },
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: grid } },
      },
      series,
    };
  }, [years, stacked, line, gap, compare, lineSolid, reduction, unit, targetYear, dark, width]);

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <ReactEChartsCore ref={chartRef} echarts={echarts} option={option} notMerge style={{ height, width: '100%' }} />
    </div>
  );
});

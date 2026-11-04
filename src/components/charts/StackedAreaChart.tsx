import { useComputedColorScheme } from '@mantine/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

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

export const StackedAreaChart = forwardRef<ChartHandle, Props>(function StackedAreaChart(
  { years, stacked, line, gap, compare, unit, targetYear, height = 380 },
  ref,
) {
  const dark = useComputedColorScheme('light') === 'dark';
  const chartRef = useRef<ReactEChartsCore>(null);
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
    if (line) {
      series.push({
        name: line.name,
        type: 'line',
        symbol: 'none',
        color: line.color ?? text,
        lineStyle: { type: 'dashed', width: 2 },
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
        valueFormatter: (v: number) => `${fmt(v)} ${unit}`,
      },
      legend: { type: 'scroll', top: 0, textStyle: { color: text } },
      grid: { left: 8, right: 16, top: 56, bottom: 8, containLabel: true },
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
  }, [years, stacked, line, gap, compare, unit, targetYear, dark]);

  return (
    <ReactEChartsCore ref={chartRef} echarts={echarts} option={option} notMerge style={{ height, width: '100%' }} />
  );
});

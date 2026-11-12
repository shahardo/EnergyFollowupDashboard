import { useComputedColorScheme } from '@mantine/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { escapeHtml } from '../../utils/format';
import { BASE_OPTION, pageFont, textWidth, themeColors, useChartPng, type ChartHandle } from './echartsCore';
import { pickHovered, stackBands, type HoverBand, type HoverLine } from './hover';
import { legendTextCap, splitLegend } from './legend';
import { pattern } from './patterns';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

/** סדרה אחת בגרף: שם (למקרא ולטולטיפ), ערך לכל שנה (null = אין ערך), וצבע. */
interface AreaSeries {
  name: string;
  values: (number | null)[];
  color?: string;
}

interface Props {
  years: number[];
  /** השכבות הנערמות (מגזרים או מקורות). */
  stacked: AreaSeries[];
  /** קו שלא נערם, למשל הביקוש. מקווקו, או רציף עם lineSolid. */
  line?: AreaSeries;
  /** קווי השוואה מקווקווים כחולים (תרחיש שנטען להשוואה). */
  compare?: AreaSeries[];
  /** קו רציף במקום מקווקו (למשל ביקוש נטו בגרף ההיצע). */
  lineSolid?: boolean;
  /**
   * פס ההפחתות בראש הערימה: מהביקוש נטו (net) ועד הביקוש ברוטו, בשכבות (layers, כל אחת עם צבע),
   * בפסים מעל גוון שקוף של צבע השכבה. faint: פסים בהירים ועדינים, כדי שהמגזרים שמתחת ייראו.
   */
  reduction?: { net: number[]; layers: (AreaSeries & { color: string })[]; faint?: boolean };
  unit: string;
  /** ספרות אחרי הנקודה בטולטיפ. אם חסר: ספרה אחת מתחת ל-10, אחרת אפס. */
  digits?: number;
  /** השנה שמסומנת בקו אנכי. */
  targetYear: number;
  height?: number;
}

const fmtAuto = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1));

/** צבע קווי ההשוואה. */
const COMPARE_COLOR = '#1c7ed6';

/** מידות המקרא: גופן, סמל ורווחים (פיקסלים). */
const LEGEND = { fontSize: 11, itemWidth: 14, itemHeight: 10, iconGap: 5, itemGap: 10, rowHeight: 18, sidePad: 8 };

/** רוחב הגרף מעוגל לצעדים, כדי ששינוי גודל לא יבנה את הגרף מחדש בכל פיקסל. */
const WIDTH_STEP = 8;

/** רוחב טקסט במקרא, עם מרווח ביטחון קטן. */
const legendTextWidth = (text: string) => textWidth(text, LEGEND.fontSize) + 2;

/** מרחק (פיקסלים) מקו שבו הסמן נחשב מעליו. */
const LINE_HIT_PX = 5;

/** מסמן שורה בטולטיפ לפי אינדקס הסדרה, כדי להדגיש את השורה של הרצועה שמתחת לסמן. */
const TT_ATTR = 'data-tt-series';

/** שורות הטולטיפ בתוך אלמנט הגרף: השורה של הסדרה hovered מודגשת, השאר רגילות. */
function boldTooltipRow(root: HTMLElement, hovered: number | null) {
  root.querySelectorAll<HTMLElement>(`[${TT_ATTR}]`).forEach((el) => {
    el.style.fontWeight = Number(el.getAttribute(TT_ATTR)) === hovered ? '700' : '400';
  });
}

/**
 * גרף שטחים נערמים לפי שנה (ביקוש לפי מגזר, היצע לפי מקור), עם קו ביקוש, פס הפחתות, קווי השוואה
 * וקו שנת היעד. המקרא בשתי שורות מתחת לגרף; טקסט ארוך מקוצר כך שכל שורה נשארת אחת.
 */
export const StackedAreaChart = forwardRef<ChartHandle, Props>(function StackedAreaChart(
  { years, stacked, line, compare, lineSolid, reduction, unit, digits, targetYear, height = 380 },
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
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width / WIDTH_STEP) * WIDTH_STEP));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useChartPng(ref, chartRef, dark);

  // הסדרה שמתחת לסמן (רצועה או קו), כדי להדגיש את השורה שלה בטולטיפ.
  const hoveredRef = useRef<number | null>(null);
  const hitRef = useRef<{ bands: HoverBand[]; lines: HoverLine[] }>({ bands: [], lines: [] });

  const option = useMemo(() => {
    const { text, grid } = themeColors(dark);

    // ── הסדרות ─────────────────────────────────────────────────────────────
    const series: object[] = stacked.map((s) => ({
      name: s.name,
      type: 'line',
      stack: 'total',
      areaStyle: { opacity: 0.85 },
      lineStyle: { width: 0.5 },
      symbol: 'none',
      color: s.color,
      emphasis: { focus: 'series' },
      data: s.values,
    }));
    // קו שנת היעד על סדרה ריקה משלו, כך שהוא נשאר גם כשאין שכבות (למשל BCM בלי מקורות גז).
    series.push({
      name: '__target',
      type: 'line',
      data: [],
      silent: true,
      markLine: {
        symbol: 'none',
        silent: true,
        label: { formatter: String(targetYear), color: text },
        lineStyle: { color: text, type: 'solid', width: 1 },
        data: [{ xAxis: String(targetYear) }],
      },
    });
    // גבולות הרצועות לזיהוי הריחוף: פס ההפחתות קודם, כי הוא מצויר מעל הערימה.
    const bands: HoverBand[] = [];
    const lines: HoverLine[] = [];
    if (reduction && reduction.layers.some((l) => l.values.some((v) => v !== null && v > 1e-9))) {
      bands.push(
        ...stackBands(
          reduction.net,
          reduction.layers.map((l, k) => ({ seriesIndex: series.length + 1 + k, values: l.values })),
        ),
      );
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
          lineStyle: { width: 2, type: 'dashed', color: l.color, opacity: reduction.faint ? 0.35 : 1 },
          // מתחת לפסים גוון שקוף של צבע השכבה (במצב העדין: בלי גוון ופסים חלשים), כך שהמגזרים
          // נראים דרכו ושתי השכבות נבדלות זו מזו.
          areaStyle: {
            color: reduction.faint ? pattern(l.color, l.color, 0, 0.3) : pattern(l.color, l.color, 0.22),
            opacity: 1,
          },
          data: l.values,
          z: 6,
        });
      }
    }
    bands.push(...stackBands(null, stacked.map((s, k) => ({ seriesIndex: k, values: s.values }))));
    if (line) {
      lines.push({ seriesIndex: series.length, values: line.values });
      series.push({
        name: line.name,
        type: 'line',
        symbol: 'none',
        color: text,
        lineStyle: { type: lineSolid ? 'solid' : 'dashed', width: 2 },
        data: line.values,
        z: 10,
      });
    }
    for (const c of compare ?? []) {
      lines.push({ seriesIndex: series.length, values: c.values });
      series.push({
        name: c.name,
        type: 'line',
        symbol: 'none',
        color: COMPARE_COLOR,
        lineStyle: { type: [6, 4], width: 2 },
        data: c.values,
        z: 11,
      });
    }

    // ── מקרא: שתי שורות; טקסט ארוך מדי מקוצר (השם המלא בריחוף) ───────────────
    const names = series.map((x) => (x as { name: string }).name).filter((n) => !n.startsWith('__'));
    const widths = new Map(names.map((n) => [n, legendTextWidth(n)]));
    const legend = splitLegend(names).map((row, i) => {
      const cap =
        width > 0
          ? legendTextCap(
              row.map((n) => widths.get(n)!),
              width - 2 * LEGEND.sidePad,
              LEGEND.itemWidth + LEGEND.iconGap + LEGEND.itemGap,
            )
          : null;
      return {
        type: 'plain',
        show: row.length > 0,
        left: 'center',
        bottom: i === 0 ? LEGEND.rowHeight + 4 : 4,
        itemWidth: LEGEND.itemWidth,
        itemHeight: LEGEND.itemHeight,
        itemGap: LEGEND.itemGap,
        padding: [0, LEGEND.sidePad],
        textStyle: { color: text, fontSize: LEGEND.fontSize, fontFamily: pageFont() },
        tooltip: { show: cap !== null },
        data: row.map((name) =>
          cap !== null && widths.get(name)! > cap ? { name, textStyle: { width: cap, overflow: 'truncate' } } : { name },
        ),
      };
    });

    hitRef.current = { bands, lines };

    const fmt = (v: number) => (digits === undefined ? fmtAuto(v) : v.toFixed(digits));
    return {
      ...BASE_OPTION,
      tooltip: {
        trigger: 'axis',
        // שמות הסדרות מגיעים מקבצים: מנוטרלים לפני שנכנסים ל-HTML של הטולטיפ.
        // השורה של הסדרה שמתחת לסמן מודגשת כולה (ומתעדכנת גם בלי לבנות את הטולטיפ מחדש, ראו onMove).
        formatter: (
          items: { seriesName: string; seriesIndex: number; value: number | null; marker: string; axisValueLabel: string }[],
        ) => {
          const rows = items
            .filter((i) => !i.seriesName.startsWith('__') && i.value !== null && i.value !== undefined)
            .map((i) => {
              const weight = i.seriesIndex === hoveredRef.current ? 700 : 400;
              return (
                `<div ${TT_ATTR}="${i.seriesIndex}" style="font-weight:${weight}">` +
                `${i.marker} ${escapeHtml(i.seriesName)}: <b>${fmt(i.value as number)}</b> ${unit}</div>`
              );
            });
          return [`<div><b>${items[0]?.axisValueLabel ?? ''}</b></div>`, ...rows].join('');
        },
      },
      legend,
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
  }, [years, stacked, line, compare, lineSolid, reduction, unit, digits, targetYear, dark, width]);

  // ECharts לא בונה את טולטיפ הציר מחדש כל עוד השנה לא השתנתה, ולכן ההדגשה מתעדכנת ישירות ב-DOM.
  const onChartReady = useCallback((chart: echarts.ECharts) => {
    const zr = chart.getZr();
    const update = (hovered: number | null) => {
      hoveredRef.current = hovered;
      boldTooltipRow(chart.getDom(), hovered);
    };
    zr.on('mousemove', (e: { offsetX: number; offsetY: number }) => {
      const pt = [e.offsetX, e.offsetY];
      if (!chart.containPixel({ gridIndex: 0 }, pt)) return update(null);
      const x0 = chart.convertToPixel({ xAxisIndex: 0 }, 0) as number;
      const x1 = chart.convertToPixel({ xAxisIndex: 0 }, 1) as number;
      const value = chart.convertFromPixel({ yAxisIndex: 0 }, e.offsetY) as number;
      const tol = Math.abs((chart.convertFromPixel({ yAxisIndex: 0 }, e.offsetY + LINE_HIT_PX) as number) - value);
      const f = x1 !== x0 ? (e.offsetX - x0) / (x1 - x0) : 0;
      const { bands, lines } = hitRef.current;
      update(pickHovered(bands, lines, f, value, tol));
    });
    zr.on('globalout', () => update(null));
  }, []);

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={option}
        notMerge
        onChartReady={onChartReady}
        style={{ height, width: '100%' }}
      />
    </div>
  );
});

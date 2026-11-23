import { useImperativeHandle, type Ref, type RefObject } from 'react';
import type ReactEChartsCore from 'echarts-for-react/lib/core';

/** ממשק משותף לגרפים: ייצוא PNG. */
export interface ChartHandle {
  /** תמונת PNG של הגרף, ברזולוציה כפולה ועם רקע אטום. */
  toPng: () => string | null;
}

/** צבעי הגרפים לפי ערכת הצבעים (בהירה / כהה). */
export function themeColors(dark: boolean) {
  return {
    /** טקסט צירים ומקרא. */
    text: dark ? '#c9c9c9' : '#495057',
    /** טקסט בתוך תיבות. */
    boxText: dark ? '#f1f3f5' : '#212529',
    /** קווי רשת. */
    grid: dark ? '#373a40' : '#e9ecef',
    /** רקע הכרטיס (גם הרקע האטום של ה-PNG). */
    bg: dark ? '#242424' : '#ffffff',
  };
}

/** הגדרות בסיס לכל גרף: רקע שקוף, אנימציה קצרה, הגופן של הדף. */
export const BASE_OPTION = {
  backgroundColor: 'transparent',
  animationDuration: 300,
  animationDurationUpdate: 200,
  textStyle: { fontFamily: 'inherit' },
} as const;

let fontFamily: string | undefined;
/** הגופן של הדף (נקרא פעם אחת): משמש גם למדידה, כדי שהחישוב יתאים לציור. */
export function pageFont(): string {
  if (fontFamily === undefined) {
    fontFamily =
      typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily || 'sans-serif' : 'sans-serif';
  }
  return fontFamily;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** רוחב טקסט בפיקסלים בגופן של הדף (מעוגל למעלה). בלי DOM: הערכה לפי מספר התווים. */
export function textWidth(text: string, fontSize: number, weight = 400): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (!measureCtx) return text.length * fontSize * 0.6;
  measureCtx.font = `${weight} ${fontSize}px ${pageFont()}`;
  return Math.ceil(measureCtx.measureText(text).width);
}

/**
 * Exposes toPng through the chart component's ref: a 2× PNG on the theme's opaque background. `showAxisName`: the
 * Y-axis name is transparent on screen (a menu covers it), so it is made visible just for the image.
 */
export function useChartPng(ref: Ref<ChartHandle>, chartRef: RefObject<ReactEChartsCore>, dark: boolean, showAxisName = false) {
  useImperativeHandle(
    ref,
    () => ({
      toPng: () => {
        const chart = chartRef.current?.getEchartsInstance();
        if (!chart) return null;
        const { text, bg } = themeColors(dark);
        const nameColor = (color: string) =>
          chart.setOption({ animation: false, yAxis: { nameTextStyle: { color } } }, { lazyUpdate: false });
        if (showAxisName) nameColor(text);
        const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bg });
        if (showAxisName) {
          nameColor('transparent');
          chart.setOption({ animation: true });
        }
        return url;
      },
    }),
    [chartRef, dark, showAxisName],
  );
}

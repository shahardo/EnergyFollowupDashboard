// חלקים משותפים לקוביית הטרילמה (TrilemmaCard) ולקוביית הפירמידה (PyramidCard).
import { Group, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import { TRILEMMA_AXES, trilemmaMean, type TrilemmaAxis, type TrilemmaScore } from '../../model/trilemma';
import { ColorSquare } from '../controls/inputs';
import classes from './trilemma.module.css';

/** רמות הרשת: משולשים ב-25%, 50%, 75% ו-100% מהציון המרבי. */
export const GRID = [2.5, 5, 7.5, 10];

/** נקודות במסך → מאפיין points של polygon ב-SVG. */
export const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** הקו של רמת רשת: המשולש החיצוני רציף ועבה יותר, השאר מקווקווים. */
export const gridStroke = (g: number) => ({
  stroke: 'var(--mantine-color-default-border)',
  strokeWidth: g === 10 ? 1.2 : 0.8,
  strokeDasharray: g === 10 ? undefined : '3 3',
});

/** הקו של ציר מהמרכז אל הקודקוד החיצוני. */
export const AXIS_STROKE = { stroke: 'var(--mantine-color-default-border)', strokeWidth: 0.8 };

/** תיאור הציונים לקורא מסך: "ביטחון 7, מחיר 8, קיימות 4". */
export const scoreSummary = (score: TrilemmaScore) =>
  TRILEMMA_AXES.map((ax) => `${he.trilemma.axes[ax]} ${score[ax]}`).join(', ');

/**
 * שורת הכותרת של קובייה: ריבוע צבע ושם הערוץ, ובצד השני הציון המשוקלל (ממוצע שלושת הצירים).
 * בלי scoreColor הציון אפור-שחור קבוע.
 */
export function CardHeader({
  label,
  score,
  color,
  titleColor,
  scoreColor,
}: {
  label: string;
  score: TrilemmaScore;
  color: string;
  titleColor?: string;
  scoreColor?: string;
}) {
  return (
    <Group gap={8} wrap="nowrap" mb={2} justify="space-between">
      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
        <ColorSquare color={color} />
        <Text fw={600} size="sm" lineClamp={1} title={label} c={titleColor}>
          {label}
        </Text>
      </Group>
      <Text
        fw={700}
        fz={20}
        lh={1}
        c={scoreColor}
        className={scoreColor ? undefined : classes.score}
        style={{ direction: 'ltr' }}
      >
        {trilemmaMean(score).toFixed(1)}
      </Text>
    </Group>
  );
}

/** הילה בצבע הרקע סביב טקסט שמצויר מעל צורות. */
export const HALO = {
  stroke: 'var(--mantine-color-body)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
  paintOrder: 'stroke' as const,
};

/** תווית ציר ב-SVG: שם הציר והציון בו, עם הסבר בריחוף. */
export function AxisLabel({
  axis,
  value,
  x,
  y,
  anchor,
  halo,
}: {
  axis: TrilemmaAxis;
  value: number;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  halo?: boolean;
}) {
  const t = he.trilemma;
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={11}
      fill="var(--mantine-color-dimmed)"
      style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
      {...(halo ? HALO : {})}
    >
      <title>{t.axisHints[axis]}</title>
      {t.axes[axis]}{' '}
      <tspan fontWeight={700} fill="var(--mantine-color-text)">
        {value}
      </tspan>
    </text>
  );
}

/** "יישימות: N%" מתחת לקובייה. */
export function FeasibilityLine({ pct }: { pct: number }) {
  return (
    <Text size="sm" mt={6}>
      {he.trilemma.feasibility}{' '}
      <Text span fw={700} style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
        {pct}%
      </Text>
    </Text>
  );
}

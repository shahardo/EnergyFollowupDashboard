import { toPct } from '../../model/units';
import { Paper, Progress } from '@mantine/core';
import { he } from '../../i18n/he';
import {
  axisPoint,
  feasibilityColor,
  TRILEMMA_AXES,
  trianglePoints,
  type TrilemmaAxis,
  type TrilemmaScore,
} from '../../model/trilemma';
import { AXIS_STROKE, AxisLabel, CardHeader, FeasibilityLine, GRID, gridStroke, pts, scoreSummary } from './parts';

interface Props {
  label: string;
  score: TrilemmaScore;
  /** הגוון של הערוץ (0..360). הרוויה נקבעת לפי היישימות. */
  hue: number;
}

const W = 220;
const H = 165;
const CX = W / 2;
const CY = 98;
const R = 74;

/** מיקום התווית של כל ציר, מעבר לקודקוד. */
const LABEL: Record<TrilemmaAxis, { dx: number; dy: number; anchor: 'middle' | 'start' | 'end' }> = {
  security: { dx: 0, dy: -8, anchor: 'middle' },
  affordability: { dx: -4, dy: 16, anchor: 'start' },
  sustainability: { dx: 4, dy: 16, anchor: 'end' },
};

/** קוביית ערוץ אספקה: משולש הטרילמה על שלושת הצירים, ומתחתיו היישימות. הצבע דוהה ככל שהיישימות נמוכה. */
export function TrilemmaCard({ label, score, hue }: Props) {
  const t = he.trilemma;
  const color = feasibilityColor(hue, score.feasibility);
  const fill = feasibilityColor(hue, score.feasibility, 14);
  const pct = Math.round(toPct(score.feasibility));
  const tri = trianglePoints(score, CX, CY, R);

  return (
    <Paper withBorder p="sm" radius="md">
      <CardHeader label={label} score={score} color={color} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${label}: ${scoreSummary(score)}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* רשת: משולשים ב-25%, 50%, 75%, 100%, ושלושת הצירים */}
        {GRID.map((g) => (
          <polygon
            key={g}
            points={pts(TRILEMMA_AXES.map((ax) => axisPoint(ax, g, CX, CY, R)))}
            fill="none"
            {...gridStroke(g)}
          />
        ))}
        {TRILEMMA_AXES.map((ax) => {
          const [x, y] = axisPoint(ax, 10, CX, CY, R);
          return <line key={ax} x1={CX} y1={CY} x2={x} y2={y} {...AXIS_STROKE} />;
        })}
        {/* משולש הציונים */}
        <polygon points={pts(tri)} fill={fill} fillOpacity={0.55} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {tri.map(([x, y], i) => (
          <circle key={TRILEMMA_AXES[i]} cx={x} cy={y} r={3.2} fill={color} />
        ))}
        {/* תוויות הצירים והציון */}
        {TRILEMMA_AXES.map((ax) => {
          const [x, y] = axisPoint(ax, 10, CX, CY, R);
          const l = LABEL[ax];
          return <AxisLabel key={ax} axis={ax} value={score[ax]} x={x + l.dx} y={y + l.dy} anchor={l.anchor} />;
        })}
      </svg>
      <FeasibilityLine pct={pct} />
      <Progress
        value={pct}
        color={color}
        size="xs"
        mt={4}
        aria-label={`${t.feasibility} ${pct}%`}
      />
    </Paper>
  );
}

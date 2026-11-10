import { Group, Paper, Progress, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import {
  axisPoint,
  feasibilityColor,
  TRILEMMA_AXES,
  trianglePoints,
  type TrilemmaAxis,
  type TrilemmaScore,
} from '../../model/trilemma';

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
const GRID = [2.5, 5, 7.5, 10];

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** מיקום התווית של כל ציר, מעבר לקודקוד. */
const LABEL: Record<TrilemmaAxis, { dx: number; dy: number; anchor: 'middle' | 'start' | 'end' }> = {
  security: { dx: 0, dy: -8, anchor: 'middle' },
  affordability: { dx: -4, dy: 16, anchor: 'start' },
  sustainability: { dx: 4, dy: 16, anchor: 'end' },
};

/** קוביית ערוץ אספקה: משולש הטרילמה על שלושת הצירים, ומתחתיו היישימות. */
export function TrilemmaCard({ label, score, hue }: Props) {
  const t = he.trilemma;
  const color = feasibilityColor(hue, score.feasibilityPct);
  const fill = feasibilityColor(hue, score.feasibilityPct, 14);
  const tri = trianglePoints(score, CX, CY, R);
  const summary = TRILEMMA_AXES.map((ax) => `${t.axes[ax]} ${score[ax]}`).join(', ');

  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap={8} wrap="nowrap" mb={2}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
        <Text fw={600} size="sm" lineClamp={1} title={label}>
          {label}
        </Text>
      </Group>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${label}: ${summary}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* רשת: משולשים ב-25%, 50%, 75%, 100%, ושלושת הצירים */}
        {GRID.map((g) => (
          <polygon
            key={g}
            points={pts(TRILEMMA_AXES.map((ax) => axisPoint(ax, g, CX, CY, R)))}
            fill="none"
            stroke="var(--mantine-color-default-border)"
            strokeWidth={g === 10 ? 1.2 : 0.8}
            strokeDasharray={g === 10 ? undefined : '3 3'}
          />
        ))}
        {TRILEMMA_AXES.map((ax) => {
          const [x, y] = axisPoint(ax, 10, CX, CY, R);
          return (
            <line
              key={ax}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="var(--mantine-color-default-border)"
              strokeWidth={0.8}
            />
          );
        })}
        {/* משולש הציונים */}
        <polygon
          points={pts(tri)}
          fill={fill}
          fillOpacity={0.55}
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {tri.map(([x, y], i) => (
          <circle key={TRILEMMA_AXES[i]} cx={x} cy={y} r={3.2} fill={color} />
        ))}
        {/* תוויות הצירים והציון */}
        {TRILEMMA_AXES.map((ax) => {
          const [x, y] = axisPoint(ax, 10, CX, CY, R);
          const l = LABEL[ax];
          return (
            <text
              key={ax}
              x={x + l.dx}
              y={y + l.dy}
              textAnchor={l.anchor}
              fontSize={11}
              fill="var(--mantine-color-dimmed)"
              style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
            >
              <title>{t.axisHints[ax]}</title>
              {t.axes[ax]}{' '}
              <tspan fontWeight={700} fill="var(--mantine-color-text)">
                {score[ax]}
              </tspan>
            </text>
          );
        })}
      </svg>
      <Group gap={6} justify="space-between" mt={6} wrap="nowrap">
        <Text size="sm">
          {t.feasibility}{' '}
          <Text span fw={700} style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
            {score.feasibilityPct}%
          </Text>
        </Text>
      </Group>
      <Progress
        value={score.feasibilityPct}
        color={color}
        size="xs"
        mt={4}
        aria-label={`${t.feasibility} ${score.feasibilityPct}%`}
      />
    </Paper>
  );
}

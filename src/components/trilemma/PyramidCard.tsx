import { Group, Paper, Text } from '@mantine/core';
import { he } from '../../i18n/he';
import { buildPyramid, groundPoint, project, type Vec3 } from '../../model/pyramid';
import { TRILEMMA_AXES, trilemmaMean, type TrilemmaAxis, type TrilemmaScore } from '../../model/trilemma';
import classes from './TrilemmaCard.module.css';

interface Props {
  label: string;
  score: TrilemmaScore;
  /** הגוון של הערוץ (0..360). צבע מלא: היישימות מקודדת בגובה בלבד, לא בצבע. */
  hue: number;
}

const W = 220;
const H = 165;
/** מרכז הרצפה במסך (מוזז שמאלה: הסיבוב מרחיק את קודקוד הקיימות ימינה). */
const CX = W / 2 - 12;
const CY = 120;
const R = 74;
/** גובה הפירמידה ביישימות 100%. */
const H_MAX = 95;
const GRID = [2.5, 5, 7.5, 10];
const TICKS = [25, 50, 75, 100];

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const scr = (v: Vec3) => project(v, CX, CY);

/** מיקום התווית של כל ציר, ליד הקודקוד החיצוני על הרצפה (ביטחון משמאל לקודקוד האחורי, הרחק מציר הגובה). */
const LABEL: Record<TrilemmaAxis, { dx: number; dy: number; anchor: 'middle' | 'start' | 'end' }> = {
  security: { dx: -6, dy: 3, anchor: 'end' },
  affordability: { dx: -4, dy: 15, anchor: 'start' },
  sustainability: { dx: 4, dy: 15, anchor: 'end' },
};

/** הילה בצבע הרקע סביב טקסט שמצויר מעל הפאות. */
const halo = {
  stroke: 'var(--mantine-color-body)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
  paintOrder: 'stroke' as const,
};

/** קוביית ערוץ אספקה: פירמידה שבסיסה משולש הטרילמה וגובהה היישימות, עם ציר גובה משונת. */
export function PyramidCard({ label, score, hue }: Props) {
  const t = he.trilemma;
  const p = buildPyramid(score, R, H_MAX);
  const color = `hsl(${hue} 62% 46%)`;
  const edge = `hsl(${hue} 55% 26%)`;
  const summary = `${TRILEMMA_AXES.map((ax) => `${t.axes[ax]} ${score[ax]}`).join(', ')}, ${t.feasibility} ${score.feasibilityPct}%`;

  const base = scr(p.centroid);
  const apex = scr(p.apex);
  const top = scr([p.centroid[0], H_MAX, p.centroid[2]]);

  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap={8} wrap="nowrap" mb={2} justify="space-between">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          <Text fw={600} size="sm" lineClamp={1} title={label}>
            {label}
          </Text>
        </Group>
        <Text fw={700} fz={20} lh={1} className={classes.score} style={{ direction: 'ltr' }}>
          {trilemmaMean(score).toFixed(1)}
        </Text>
      </Group>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${label}: ${summary}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* הרצפה: רשת הטרילמה (25%..100%) ושלושת הצירים, בהיטל */}
        {GRID.map((g) => (
          <polygon
            key={g}
            points={pts(TRILEMMA_AXES.map((ax) => scr(groundPoint(ax, g, R))))}
            fill={g === 10 ? 'var(--mantine-color-default-hover)' : 'none'}
            stroke="var(--mantine-color-default-border)"
            strokeWidth={g === 10 ? 1.2 : 0.8}
            strokeDasharray={g === 10 ? undefined : '3 3'}
          />
        ))}
        {TRILEMMA_AXES.map((ax) => {
          const [x, y] = scr(groundPoint(ax, 10, R));
          return (
            <line key={ax} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--mantine-color-default-border)" strokeWidth={0.8} />
          );
        })}

        {/* הפאות הגלויות: צבע מלא, הבהירות לפי כיוון הפאה לאור בלבד */}
        {p.faces
          .filter((f) => f.visible)
          .map((f, i) => (
            <polygon
              key={i}
              points={pts(f.points.map(scr))}
              fill={`hsl(${hue} 62% ${(28 + 40 * f.light).toFixed(0)}%)`}
              stroke={edge}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ))}

        {/* ציר הגובה: מקווקו בתוך הפירמידה, רציף מעל הקודקוד, עם שנתות כל 25% */}
        <line x1={base[0]} y1={base[1]} x2={apex[0]} y2={apex[1]} stroke="white" strokeOpacity={0.85} strokeWidth={1.2} strokeDasharray="2 2" />
        <line x1={apex[0]} y1={apex[1]} x2={top[0]} y2={top[1]} stroke="var(--mantine-color-text)" strokeWidth={1.2} />
        {TICKS.map((tk) => {
          const [x, y] = scr([p.centroid[0], (H_MAX * tk) / 100, p.centroid[2]]);
          const inside = (H_MAX * tk) / 100 < p.height - 0.5;
          return (
            <g key={tk}>
              <line
                x1={x - 4}
                y1={y}
                x2={x + 4}
                y2={y}
                stroke={inside ? 'white' : 'var(--mantine-color-text)'}
                strokeOpacity={inside ? 0.85 : 1}
                strokeWidth={tk === 100 ? 1.4 : 1}
              />
              <text
                x={x - 7}
                y={y + 3}
                textAnchor="end"
                fontSize={8}
                fill="var(--mantine-color-dimmed)"
                style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}
                {...halo}
              >
                {tk}%
              </text>
            </g>
          );
        })}
        <circle cx={apex[0]} cy={apex[1]} r={2.8} fill={edge} stroke="white" strokeWidth={1} />

        {/* תוויות הצירים והציון */}
        {TRILEMMA_AXES.map((ax) => {
          const [x, y] = scr(groundPoint(ax, 10, R));
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
              {...halo}
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
      <Text size="sm" mt={6}>
        {t.feasibility}{' '}
        <Text span fw={700} style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
          {score.feasibilityPct}%
        </Text>
      </Text>
    </Paper>
  );
}

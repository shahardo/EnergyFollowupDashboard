import { Group, Paper, Text } from '@mantine/core';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { he } from '../../i18n/he';
import { buildPyramid, FORESHORTEN, groundPoint, normalizeYaw, project, YAW, type Vec3 } from '../../model/pyramid';
import { TRILEMMA_AXES, trilemmaMean, type TrilemmaScore } from '../../model/trilemma';
import classes from './TrilemmaCard.module.css';

interface Props {
  label: string;
  score: TrilemmaScore;
  /** הגוון של הערוץ (0..360). צבע מלא: היישימות מקודדת בגובה בלבד, לא בצבע. */
  hue: number;
  /** זווית הסיבוב סביב ציר היישימות (ברדיאנים), משותפת לכל התיבות. */
  yaw: number;
  onYaw: (yaw: number) => void;
}

const W = 240;
const H = 168;
/** ציר היישימות (מרכז הכובד של הבסיס) במסך: קבוע, והסצנה מסתובבת סביבו. */
const CX = W / 2;
const CY = 106;
const R = 60;
/** גובה הפירמידה ביישימות 100%. */
const H_MAX = 92;
const GRID = [2.5, 5, 7.5, 10];
const TICKS = [25, 50, 75, 100];
/** סיבוב לכל פיקסל גרירה, ולכל לחיצה על חץ. */
const RAD_PER_PX = (0.8 * Math.PI) / 180;
const KEY_STEP = (10 * Math.PI) / 180;
/** תווית ציר: כמה להרחיק מהקודקוד, ומרווח מקצה התיבה שבו העוגן מתהפך כדי שהטקסט לא יצא החוצה. */
const LABEL_GAP = 9;
const LABEL_ROOM = 52;

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** הילה בצבע הרקע סביב טקסט שמצויר מעל הפאות. */
const halo = {
  stroke: 'var(--mantine-color-body)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
  paintOrder: 'stroke' as const,
};

/** מיקום תווית של ציר: הלאה מהקודקוד, בכיוון שמרחיק מציר היישימות; העוגן לפי הצד, בלי לחרוג מהתיבה. */
function labelPlace([vx, vy]: [number, number]) {
  const dx = vx - CX;
  const dy = vy - CY;
  const n = Math.hypot(dx, dy) || 1;
  let x = vx + (dx / n) * LABEL_GAP;
  const y = vy + (dy / n) * LABEL_GAP + (dy >= 0 ? 8 : 0);
  let anchor: 'start' | 'middle' | 'end' = dx / n > 0.35 ? 'start' : dx / n < -0.35 ? 'end' : 'middle';
  if (anchor !== 'end' && x > W - LABEL_ROOM) {
    anchor = 'end';
    x = Math.min(x, W - 2);
  } else if (anchor !== 'start' && x < LABEL_ROOM) {
    anchor = 'start';
    x = Math.max(x, 2);
  }
  return { x, y, anchor };
}

/**
 * קוביית ערוץ אספקה: פירמידה שבסיסה משולש הטרילמה וגובהה היישימות, עם ציר גובה משונת.
 * גרירה ימינה ושמאלה (או החיצים) מסובבת את כל הסצנה סביב ציר היישימות; לחיצה כפולה מאפסת.
 */
export function PyramidCard({ label, score, hue, yaw, onYaw }: Props) {
  const t = he.trilemma;
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  const p = buildPyramid(score, R, H_MAX, yaw);
  const scr = (v: Vec3) => project(v, CX, CY, FORESHORTEN, yaw, p.centroid);
  const color = `hsl(${hue} 62% 46%)`;
  const edge = `hsl(${hue} 55% 26%)`;
  const summary = `${TRILEMMA_AXES.map((ax) => `${t.axes[ax]} ${score[ax]}`).join(', ')}, ${t.feasibility} ${score.feasibilityPct}%`;

  const origin = scr([0, 0, 0]);
  const apex = scr(p.apex);
  const top = scr([p.centroid[0], H_MAX, p.centroid[2]]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, yaw };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current) onYaw(normalizeYaw(drag.current.yaw + (e.clientX - drag.current.x) * RAD_PER_PX));
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.key === 'ArrowRight' ? KEY_STEP : e.key === 'ArrowLeft' ? -KEY_STEP : 0;
    if (step) {
      e.preventDefault();
      onYaw(normalizeYaw(yaw + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onYaw(YAW);
    }
  };

  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap={8} wrap="nowrap" mb={2} justify="space-between">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          {/* הכותרת והציון בצבע הפירמידה */}
          <Text fw={600} size="sm" lineClamp={1} title={label} c={color}>
            {label}
          </Text>
        </Group>
        <Text fw={700} fz={20} lh={1} c={color} style={{ direction: 'ltr' }}>
          {trilemmaMean(score).toFixed(1)}
        </Text>
      </Group>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        tabIndex={0}
        aria-label={`${label}: ${summary}. ${t.rotateHint}`}
        className={classes.spin}
        onPointerDown={onPointerDown}
        // גרירה בעכבר לא מעבירה פוקוס (בלי מסגרת פוקוס אחרי סיבוב); המקלדת עדיין מגיעה עם Tab
        onMouseDown={(e) => e.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => onYaw(YAW)}
        onKeyDown={onKeyDown}
      >
        <title>{t.rotateHint}</title>
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
            <line
              key={ax}
              x1={origin[0]}
              y1={origin[1]}
              x2={x}
              y2={y}
              stroke="var(--mantine-color-default-border)"
              strokeWidth={0.8}
            />
          );
        })}

        {/* הפאות הגלויות: צבע מלא, הבהירות לפי כיוון הפאה לאור בלבד */}
        {p.faces.map((f, i) =>
          f.visible ? (
            <polygon
              key={i}
              points={pts(f.points.map(scr))}
              fill={`hsl(${hue} 62% ${(28 + 40 * f.light).toFixed(0)}%)`}
              stroke={edge}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ) : null,
        )}

        {/* ציר היישימות: מקווקו בתוך הפירמידה, רציף מעל הקודקוד, עם שנתות כל 25% */}
        <line
          x1={CX}
          y1={CY}
          x2={apex[0]}
          y2={apex[1]}
          stroke="white"
          strokeOpacity={0.85}
          strokeWidth={1.2}
          strokeDasharray="2 2"
        />
        <line x1={apex[0]} y1={apex[1]} x2={top[0]} y2={top[1]} stroke="var(--mantine-color-text)" strokeWidth={1.2} />
        {TICKS.map((tk) => {
          const y = CY - (H_MAX * tk) / 100;
          const inside = (H_MAX * tk) / 100 < p.height - 0.5;
          return (
            <g key={tk}>
              <line
                x1={CX - 4}
                y1={y}
                x2={CX + 4}
                y2={y}
                stroke={inside ? 'white' : 'var(--mantine-color-text)'}
                strokeOpacity={inside ? 0.85 : 1}
                strokeWidth={tk === 100 ? 1.4 : 1}
              />
              <text
                x={CX - 7}
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

        {/* תוויות הצירים והציון, ליד הקודקודים החיצוניים של הרצפה */}
        {TRILEMMA_AXES.map((ax) => {
          const l = labelPlace(scr(groundPoint(ax, 10, R)));
          return (
            <text
              key={ax}
              x={l.x}
              y={l.y}
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

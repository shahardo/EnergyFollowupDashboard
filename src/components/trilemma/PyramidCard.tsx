import { Group, Paper, Text } from '@mantine/core';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { he } from '../../i18n/he';
import {
  buildPyramid,
  clampPitch,
  DEFAULT_VIEW,
  groundPoint,
  normalizeYaw,
  project,
  type PyramidView,
  type Vec3,
} from '../../model/pyramid';
import { TRILEMMA_AXES, trilemmaMean, type TrilemmaScore } from '../../model/trilemma';
import classes from './TrilemmaCard.module.css';

interface Props {
  label: string;
  score: TrilemmaScore;
  /** הגוון של הערוץ (0..360). צבע מלא: היישימות מקודדת בגובה בלבד, לא בצבע. */
  hue: number;
  /** כיוון המבט (סיבוב סביב ציר היישימות והטיה שלו אל הצופה), משותף לכל התיבות. */
  view: PyramidView;
  onView: (view: PyramidView) => void;
}

const W = 240;
const H = 170;
/** ציר היישימות (מרכז הכובד של הבסיס) במסך: באמצע הרוחב, והסצנה מסתובבת סביבו. הגובה שלו נקבע לפי ההטיה. */
const CX = W / 2;
const R = 60;
/** גובה הפירמידה ביישימות 100% (לפני הקיצור של ההטיה). */
const H_MAX = 100;
/** מרווח לתווית 100% מעל הציר, ולתוויות הצירים מעל ומתחת לרצפה. */
const PAD_TOP = 6;
const LABEL_ABOVE = 14;
const LABEL_BELOW = 18;
/** מרווח מינימלי בין שנתות (בפיקסלים) כדי להציג את התוויות שלהן; אחרת רק 100%. */
const TICK_LABEL_MIN_GAP = 8;
const GRID = [2.5, 5, 7.5, 10];
const TICKS = [25, 50, 75, 100];
/** סיבוב / הטיה לכל פיקסל גרירה, ולכל לחיצה על חץ. */
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
function labelPlace([vx, vy]: [number, number], cy: number) {
  const dx = vx - CX;
  const dy = vy - cy;
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

/** רוחב משוער של תווית ציר (שם + ציון) וגובה שורה, כדי להזיז תוויות שנופלות זו על זו. */
const LABEL_W = 50;
const LABEL_LINE = 12;

/** מיקום שלוש תוויות הצירים; תווית שחופפת לתווית שמעליה יורדת שורה (למשל במבט מהצד). */
function placeLabels(vertices: [number, number][], cy: number) {
  const labels = vertices.map((v) => labelPlace(v, cy));
  const span = (l: (typeof labels)[number]) =>
    l.anchor === 'start' ? [l.x, l.x + LABEL_W] : l.anchor === 'end' ? [l.x - LABEL_W, l.x] : [l.x - LABEL_W / 2, l.x + LABEL_W / 2];
  const order = labels.map((_, i) => i).sort((a, b) => labels[a].y - labels[b].y);
  order.forEach((i, k) => {
    const [a0, a1] = span(labels[i]);
    for (const j of order.slice(0, k)) {
      const [b0, b1] = span(labels[j]);
      if (a0 < b1 && b0 < a1 && Math.abs(labels[i].y - labels[j].y) < LABEL_LINE) {
        labels[i].y = labels[j].y + LABEL_LINE;
      }
    }
  });
  return labels;
}

/**
 * גובה ציר היישימות במסך: התוכן (הציר עד 100%, הרצפה והתוויות) ממורכז אנכית בתיבה.
 * תלוי בהטיה ובמרחק הגדול ביותר מהציר לקודקוד חיצוני של הרצפה, שלא משתנה בסיבוב, כך שהפירמידה לא קופצת בזמן סיבוב.
 */
function pivotY(pitch: number, reach: number): number {
  const s = Math.sin(pitch);
  const above = Math.max(H_MAX * Math.cos(pitch), reach * s + LABEL_ABOVE) + PAD_TOP;
  const below = reach * s + LABEL_BELOW;
  return above + Math.max(0, (H - above - below) / 2);
}

/**
 * קוביית ערוץ אספקה: פירמידה שבסיסה משולש הטרילמה וגובהה היישימות, עם ציר גובה משונת.
 * גרירה ימינה ושמאלה מסובבת את כל הסצנה סביב ציר היישימות, ומעלה ומטה מטה את הציר אל הצופה (או מרחיקה אותו);
 * החיצים עושים אותו דבר, ולחיצה כפולה מאפסת.
 */
export function PyramidCard({ label, score, hue, view, onView }: Props) {
  const t = he.trilemma;
  const { yaw, pitch } = view;
  const drag = useRef<{ x: number; y: number; view: PyramidView } | null>(null);
  const p = buildPyramid(score, R, H_MAX, yaw, pitch);
  const reach = Math.max(
    ...TRILEMMA_AXES.map((ax) => {
      const [x, , z] = groundPoint(ax, 10, R);
      return Math.hypot(x - p.centroid[0], z - p.centroid[2]);
    }),
  );
  const CY = pivotY(pitch, reach);
  const scr = (v: Vec3) => project(v, CX, CY, pitch, yaw, p.centroid);
  const tickGap = (H_MAX / TICKS.length) * Math.cos(pitch);
  const labels = placeLabels(
    TRILEMMA_AXES.map((ax) => scr(groundPoint(ax, 10, R))),
    CY,
  );
  const color = `hsl(${hue} 62% 46%)`;
  const edge = `hsl(${hue} 55% 26%)`;
  const summary = `${TRILEMMA_AXES.map((ax) => `${t.axes[ax]} ${score[ax]}`).join(', ')}, ${t.feasibility} ${score.feasibilityPct}%`;

  const origin = scr([0, 0, 0]);
  const apex = scr(p.apex);
  const top = scr([p.centroid[0], H_MAX, p.centroid[2]]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, view };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    // ימינה/שמאלה: סיבוב סביב ציר היישימות; למטה: ראש הציר מתקרב אל הצופה (מבט יותר מלמעלה)
    onView({
      yaw: normalizeYaw(d.view.yaw + (e.clientX - d.x) * RAD_PER_PX),
      pitch: clampPitch(d.view.pitch + (e.clientY - d.y) * RAD_PER_PX),
    });
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const turn = e.key === 'ArrowRight' ? KEY_STEP : e.key === 'ArrowLeft' ? -KEY_STEP : 0;
    const tilt = e.key === 'ArrowDown' ? KEY_STEP : e.key === 'ArrowUp' ? -KEY_STEP : 0;
    if (turn || tilt) {
      e.preventDefault();
      onView({ yaw: normalizeYaw(yaw + turn), pitch: clampPitch(pitch + tilt) });
    } else if (e.key === 'Home') {
      e.preventDefault();
      onView(DEFAULT_VIEW);
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
        onDoubleClick={() => onView(DEFAULT_VIEW)}
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
          const y = CY - ((H_MAX * tk) / 100) * Math.cos(pitch);
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
              {(tk === 100 || tickGap >= TICK_LABEL_MIN_GAP) && (
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
              )}
            </g>
          );
        })}
        <circle cx={apex[0]} cy={apex[1]} r={2.8} fill={edge} stroke="white" strokeWidth={1} />

        {/* תוויות הצירים והציון, ליד הקודקודים החיצוניים של הרצפה */}
        {TRILEMMA_AXES.map((ax, i) => {
          const l = labels[i];
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

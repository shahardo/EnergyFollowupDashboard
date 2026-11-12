import { Paper } from '@mantine/core';
import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
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
import { pyramidColors, TRILEMMA_AXES, type TrilemmaScore } from '../../model/trilemma';
import { AXIS_STROKE, AxisLabel, CardHeader, FeasibilityLine, GRID, gridStroke, HALO, pts, scoreSummary } from './parts';
import classes from './trilemma.module.css';

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
const TICKS = [25, 50, 75, 100];
/** סיבוב / הטיה לכל פיקסל גרירה, ולכל לחיצה על חץ. */
const RAD_PER_PX = (0.8 * Math.PI) / 180;
const KEY_STEP = (10 * Math.PI) / 180;
/** תווית ציר: כמה להרחיק מהקודקוד, ומרווח מקצה התיבה שבו העוגן מתהפך כדי שהטקסט לא יצא החוצה. */
const LABEL_GAP = 9;
const LABEL_ROOM = 52;

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
  // המרחק הגדול ביותר מהציר לקודקוד חיצוני של הרצפה: תלוי רק בציונים, לא במבט.
  const [cx, , cz] = p.centroid;
  const reach = useMemo(
    () =>
      Math.max(
        ...TRILEMMA_AXES.map((ax) => {
          const [x, , z] = groundPoint(ax, 10, R);
          return Math.hypot(x - cx, z - cz);
        }),
      ),
    [cx, cz],
  );
  const CY = pivotY(pitch, reach);
  const scr = (v: Vec3) => project(v, CX, CY, pitch, yaw, p.centroid);
  const tickGap = (H_MAX / TICKS.length) * Math.cos(pitch);
  const labels = placeLabels(
    TRILEMMA_AXES.map((ax) => scr(groundPoint(ax, 10, R))),
    CY,
  );
  const { main: color, edge, face } = pyramidColors(hue);
  const summary = `${scoreSummary(score)}, ${t.feasibility} ${score.feasibilityPct}%`;

  const origin = scr([0, 0, 0]);
  const apex = scr(p.apex);
  const top = scr([p.centroid[0], H_MAX, p.centroid[2]]);

  // בזמן גרירה מעדכנים את המבט לכל היותר פעם בפריים: כל עדכון מצייר מחדש את כל הקוביות.
  const frame = useRef<number | null>(null);
  const pending = useRef<PyramidView | null>(null);
  const scheduleView = (v: PyramidView) => {
    pending.current = v;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) onView(pending.current);
    });
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, view };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    // ימינה/שמאלה: סיבוב סביב ציר היישימות; למטה: ראש הציר מתקרב אל הצופה (מבט יותר מלמעלה)
    scheduleView({
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
      {/* הכותרת והציון בצבע הפירמידה */}
      <CardHeader label={label} score={score} color={color} titleColor={color} scoreColor={color} />
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
            {...gridStroke(g)}
          />
        ))}
        {TRILEMMA_AXES.map((ax) => {
          const [x, y] = scr(groundPoint(ax, 10, R));
          return <line key={ax} x1={origin[0]} y1={origin[1]} x2={x} y2={y} {...AXIS_STROKE} />;
        })}

        {/* הפאות הגלויות: צבע מלא, הבהירות לפי כיוון הפאה לאור בלבד */}
        {p.faces.map((f, i) =>
          f.visible ? (
            <polygon
              key={i}
              points={pts(f.points.map(scr))}
              fill={face(f.light)}
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
                  {...HALO}
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
          return <AxisLabel key={ax} axis={ax} value={score[ax]} x={l.x} y={l.y} anchor={l.anchor} halo />;
        })}
      </svg>
      <FeasibilityLine pct={score.feasibilityPct} />
    </Paper>
  );
}

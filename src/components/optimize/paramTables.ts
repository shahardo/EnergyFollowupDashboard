import type { RunParameters, RunTechnology, Span } from '../../api/client';
import { he } from '../../i18n/he';

/** תא בטבלה: מספר (מעוצב בתצוגה, גולמי ב-CSV), טקסט, או חסר. */
export type Cell = string | number | null;
/** טבלה: כותרות ושורות. */
export interface ParamTable {
  head: string[];
  rows: Cell[][];
}
/** הטבלאות של פאנל הפרמטרים. */
export type ParamSection = 'system' | 'demand' | 'technologies' | 'fuels';
/** קבוצת טכנולוגיות לסינון (all = כולן). */
export type TechGroup = 'all' | RunTechnology['group'];

const span = (s: Span | null): Cell =>
  s === null ? null : s.min === s.max ? s.min : `${formatNumber(s.min)}–${formatNumber(s.max)}`;

/** מספר לתצוגה: שלם או גדול בלי ספרות עשרוניות, בינוני עם שתיים, קטן עם שלוש ספרות משמעותיות. */
export function formatNumber(v: number): string {
  const a = Math.abs(v);
  if (Number.isInteger(v) || a >= 100) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return a === 0 ? '0' : Number(v.toPrecision(3)).toString();
}

/** טקסט של תא לתצוגה. */
export const cellText = (c: Cell): string => (c === null || c === '' ? '—' : typeof c === 'number' ? formatNumber(c) : c);

/** שם טכנולוגיה לתצוגה: מקור, או מגזר · נשא. */
export function techLabel(t: RunTechnology): string {
  if (t.group === 'endUse' && t.carrier) return `${t.label} · ${he.plan.carriers[t.carrier]}`;
  return t.label;
}

/** בונה את הטבלה של קטע (טכנולוגיות: מסוננות לפי קבוצה). */
export function paramTable(p: RunParameters, section: ParamSection, group: TechGroup = 'all'): ParamTable {
  const t = he.optimize.params;
  switch (section) {
    case 'system': {
      const s = p.system;
      const ys = s.years;
      const k = t.system;
      return {
        head: [t.key, t.value],
        rows: [
          [k.modelId, s.modelId],
          [k.runMode, he.optimize.modes[s.runMode]?.label ?? s.runMode],
          [k.region, s.region],
          [k.years, `${ys[0]}–${ys[ys.length - 1]}`],
          [k.timeslices, Object.entries(s.timeslices).map(([ts, f]) => `${ts} ${Math.round(f * 100)}%`).join(', ')],
          [k.discountRate, `${+(s.discountRate * 100).toFixed(2)}%`],
          [k.reserveMargin, s.reserveMargin],
          [k.emissionPenalty, s.emissionPenalty],
          [k.technologies, s.technologies],
          [k.commodities, s.commodities],
        ],
      };
    }
    case 'demand': {
      const ys = p.system.years;
      const total = ys.map((_, i) => p.demand.reduce((a, d) => a + d.values[i], 0));
      return {
        head: [t.demandHead, ...ys.map(String)],
        rows: [...p.demand.map((d) => [d.label, ...d.values]), [t.total, ...total]],
      };
    }
    case 'technologies': {
      const c = t.tech;
      const rows = p.technologies
        .filter((x) => group === 'all' || x.group === group)
        .map((x) => [
          techLabel(x),
          x.id,
          t.groups[x.group] ?? x.group,
          Object.entries(x.inputs)
            .map(([k, v]) => `${k} ×${formatNumber(v)}`)
            .join(', '),
          x.outputs.join(', '),
          x.capex,
          x.opexFixed,
          x.opexVariable,
          x.operatingLife,
          x.capacityFactor,
          x.reserveCredit,
          x.residualCapacity,
          span(x.capacityMax),
          span(x.capacityMin),
          span(x.activityMin),
          span(x.activityMax),
          x.firstBuildYear === null ? null : String(x.firstBuildYear),
          x.emission,
        ]);
      return {
        head: [
          c.label,
          c.id,
          c.group,
          c.inputs,
          c.outputs,
          c.capex,
          c.opexFixed,
          c.opexVariable,
          c.operatingLife,
          c.capacityFactor,
          c.reserveCredit,
          c.residualCapacity,
          c.capacityMax,
          c.capacityMin,
          c.activityMin,
          c.activityMax,
          c.firstBuildYear,
          c.emission,
        ],
        rows,
      };
    }
    case 'fuels': {
      const f = t.fuel;
      return {
        head: [f.label, f.commodity, f.price, f.earliestYear],
        rows: p.fuels.map((x) => [x.label, x.commodity, x.price, x.earliestYear === null ? null : String(x.earliestYear)]),
      };
    }
  }
}

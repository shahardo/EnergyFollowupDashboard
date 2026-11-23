import { he } from '../i18n/he';
import type { DemandPoint } from '../model/demand';
import type { MeasuredTotal } from '../model/measures';
import type { GapPoint } from '../model/gap';
import type { SupplyPoint } from '../model/supply';
import { expectedProgress, formatDate, projectedEnd, projectStatus } from '../model/projects';
import { toGW, toPct, toTWh } from '../model/units';
import type { Project, SectorDemand, SupplySource } from '../schema';

/** UTF-8 BOM, so Excel displays the Hebrew correctly. */
export const BOM = '\uFEFF';

/**
 * One cell: numbers rounded to 3 digits; text quoted when it has a comma, a quote or a newline.
 * Text starting with = + - @ (or tab / CR) gets a leading ', so Excel won't run it as a formula.
 */
const cell = (v: string | number) => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '';
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Table → CSV text with a BOM and CRLF rows (so Excel opens it correctly). */
export function toCsv(rows: (string | number)[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** CSV text (toCsv's output, including the BOM) → rows of cells, for display as a table (supports quoted cells). */
export function parseCsv(text: string): string[][] {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // Skipped; the end of the line comes with \n.
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Demand table: one row per year, one column per sector, then the reductions and net demand (display units: TWh, GW). */
export function demandCsv(points: DemandPoint[], measured: MeasuredTotal[], sectors: SectorDemand[]): string {
  const twh = new Map(points.map((p) => [`${p.year}|${p.sector}`, toTWh(p.energy)]));
  const header = [
    'שנה',
    ...sectors.map((s) => `${s.label} (TWh)`),
    'סה"כ לפני הפחתות (TWh)',
    'התייעלות אנרגטית (TWh)',
    'חיסכון באנרגיה (TWh)',
    'ביקוש נטו (TWh)',
    'ביקוש שיא נטו (GW)',
  ];
  const rows = measured.map((t) => [
    t.year,
    ...sectors.map((s) => twh.get(`${t.year}|${s.key}`) ?? 0),
    toTWh(t.grossEnergy),
    toTWh(t.efficiencyEnergy),
    toTWh(t.savingEnergy),
    toTWh(t.netEnergy),
    toGW(t.netPeak),
  ]);
  return toCsv([header, ...rows]);
}

/** Supply table: one row per year, one column per source, then the gap, coverage and renewable share (TWh, GW, %). */
export function supplyCsv(gap: GapPoint[], points: SupplyPoint[], sources: SupplySource[]): string {
  const twh = new Map(points.map((p) => [`${p.year}|${p.source}`, toTWh(p.energy)]));
  const header = [
    'שנה',
    ...sources.map((s) => `${s.label} (TWh)`),
    'סה"כ היצע (TWh)',
    'ביקוש (TWh)',
    'פער (TWh)',
    'כיסוי אנרגטי (%)',
    'הספק מובטח (GW)',
    'ביקוש שיא (GW)',
    'פער שיא (GW)',
    'מתחדשות (%)',
  ];
  const rows = gap.map((g) => [
    g.year,
    ...sources.map((s) => twh.get(`${g.year}|${s.key}`) ?? 0),
    toTWh(g.supplyEnergy),
    toTWh(g.demandEnergy),
    toTWh(g.gapEnergy),
    toPct(g.coverage),
    toGW(g.firmPower),
    toGW(g.peakDemand),
    toGW(g.peakGap),
    toPct(g.renewableShare),
  ]);
  return toCsv([header, ...rows]);
}

/** Tasks table: one row per task, with the expected progress, status and projected end as of asOf. */
export function projectsCsv(projects: Project[], asOf: string, channelLabel: (key: string) => string): string {
  const header = [
    'משימה', 'מקור אנרגיה', 'גורם אחראי', 'התחלה מתוכננת', 'סיום מתוכנן',
    'ביצוע (%)', 'צפוי (%)', 'סטטוס', 'סיום צפוי', 'הערות',
  ];
  const rows = projects.map((p) => {
    const e = projectedEnd(p, asOf);
    return [
      p.name, channelLabel(p.channel), p.owner, p.plannedStart, p.plannedEnd,
      toPct(p.progress), toPct(expectedProgress(p, asOf)), he.tracking.statuses[projectStatus(p, asOf)], e === null ? '' : formatDate(e),
      p.notes ?? '',
    ];
  });
  return toCsv([header, ...rows]);
}

/** Scenario-planning supply table: one row per year, TWh and GW per source (fuels: TWh only). */
export function planSupplyCsv(
  years: number[],
  electric: SupplyPoint[],
  fuels: SupplyPoint[],
  label: (key: string) => string,
): string {
  const keysOf = (pts: SupplyPoint[]) => [...new Set(pts.map((p) => p.source))];
  const eKeys = keysOf(electric);
  const fKeys = keysOf(fuels);
  const val = new Map([...electric, ...fuels].map((p) => [`${p.year}|${p.source}`, p]));
  const header = [
    'שנה',
    ...eKeys.flatMap((k) => [`${label(k)} (TWh)`, `${label(k)} (GW)`]),
    ...fKeys.map((k) => `${label(k)} (TWh)`),
  ];
  const rows = years.map((y) => [
    y,
    ...eKeys.flatMap((k) => [toTWh(val.get(`${y}|${k}`)?.energy ?? 0), toGW(val.get(`${y}|${k}`)?.power ?? 0)]),
    ...fKeys.map((k) => toTWh(val.get(`${y}|${k}`)?.energy ?? 0)),
  ]);
  return toCsv([header, ...rows]);
}

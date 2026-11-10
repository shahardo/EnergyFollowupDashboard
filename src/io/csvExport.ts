import type { DemandPoint } from '../model/demand';
import type { MeasuredTotal } from '../model/measures';
import type { GapPoint } from '../model/gap';
import type { SupplyPoint } from '../model/supply';
import { expectedProgress, formatDate, projectedEnd, projectStatus } from '../model/projects';
import type { Project, SectorDemand, SupplySource } from '../schema';

/** BOM של UTF-8, כדי שאקסל יציג את העברית נכון. */
export const BOM = '\uFEFF';

const cell = (v: string | number) => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '';
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function toCsv(rows: (string | number)[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function demandCsv(points: DemandPoint[], measured: MeasuredTotal[], sectors: SectorDemand[]): string {
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
    ...sectors.map((s) => points.find((p) => p.year === t.year && p.sector === s.key)?.twh ?? 0),
    t.grossTWh,
    t.efficiencyTWh,
    t.savingTWh,
    t.netTWh,
    t.netPeakGW,
  ]);
  return toCsv([header, ...rows]);
}

export function supplyCsv(gap: GapPoint[], points: SupplyPoint[], sources: SupplySource[]): string {
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
    ...sources.map((s) => points.find((p) => p.year === g.year && p.source === s.key)?.twh ?? 0),
    g.supplyTWh,
    g.demandTWh,
    g.gapTWh,
    g.coveragePct,
    g.firmGW,
    g.peakDemandGW,
    g.peakGapGW,
    g.renewablePct,
  ]);
  return toCsv([header, ...rows]);
}

const STATUS_HE = { 'on-track': 'בזמן', 'at-risk': 'בסיכון', delayed: 'מתעכב' } as const;

export function projectsCsv(projects: Project[], asOf: string, channelLabel: (key: string) => string): string {
  const header = [
    'משימה', 'מקור אנרגיה', 'גורם אחראי', 'התחלה מתוכננת', 'סיום מתוכנן',
    'ביצוע (%)', 'צפוי (%)', 'סטטוס', 'סיום צפוי', 'הערות',
  ];
  const rows = projects.map((p) => {
    const e = projectedEnd(p, asOf);
    return [
      p.name, channelLabel(p.channel), p.owner, p.plannedStart, p.plannedEnd,
      p.progressPct, expectedProgress(p, asOf), STATUS_HE[projectStatus(p, asOf)], e === null ? '' : formatDate(e),
      p.notes ?? '',
    ];
  });
  return toCsv([header, ...rows]);
}

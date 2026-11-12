import { he } from '../i18n/he';
import type { DemandPoint } from '../model/demand';
import type { MeasuredTotal } from '../model/measures';
import type { GapPoint } from '../model/gap';
import type { SupplyPoint } from '../model/supply';
import { expectedProgress, formatDate, projectedEnd, projectStatus } from '../model/projects';
import type { Project, SectorDemand, SupplySource } from '../schema';

/** BOM של UTF-8, כדי שאקסל יציג את העברית נכון. */
export const BOM = '\uFEFF';

/**
 * תא אחד: מספרים מעוגלים ל-3 ספרות; טקסט במירכאות כשיש בו פסיק, מירכאה או שורה חדשה.
 * טקסט שמתחיל ב-= + - @ (או טאב / CR) מקבל ' בהתחלה, כדי שאקסל לא יריץ אותו כנוסחה.
 */
const cell = (v: string | number) => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '';
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** טבלה → טקסט CSV עם BOM ושורות CRLF (כך אקסל פותח אותו נכון). */
export function toCsv(rows: (string | number)[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** טבלת הביקוש: שורה לכל שנה, עמודה לכל מגזר, ואחריהן ההפחתות והביקוש נטו. */
export function demandCsv(points: DemandPoint[], measured: MeasuredTotal[], sectors: SectorDemand[]): string {
  const twh = new Map(points.map((p) => [`${p.year}|${p.sector}`, p.twh]));
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
    t.grossTWh,
    t.efficiencyTWh,
    t.savingTWh,
    t.netTWh,
    t.netPeakGW,
  ]);
  return toCsv([header, ...rows]);
}

/** טבלת ההיצע: שורה לכל שנה, עמודה לכל מקור, ואחריהן הפער, הכיסוי והמתחדשות. */
export function supplyCsv(gap: GapPoint[], points: SupplyPoint[], sources: SupplySource[]): string {
  const twh = new Map(points.map((p) => [`${p.year}|${p.source}`, p.twh]));
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

/** טבלת המשימות: שורה לכל משימה, עם הצפוי, הסטטוס והסיום הצפוי לתאריך asOf. */
export function projectsCsv(projects: Project[], asOf: string, channelLabel: (key: string) => string): string {
  const header = [
    'משימה', 'מקור אנרגיה', 'גורם אחראי', 'התחלה מתוכננת', 'סיום מתוכנן',
    'ביצוע (%)', 'צפוי (%)', 'סטטוס', 'סיום צפוי', 'הערות',
  ];
  const rows = projects.map((p) => {
    const e = projectedEnd(p, asOf);
    return [
      p.name, channelLabel(p.channel), p.owner, p.plannedStart, p.plannedEnd,
      p.progressPct, expectedProgress(p, asOf), he.tracking.statuses[projectStatus(p, asOf)], e === null ? '' : formatDate(e),
      p.notes ?? '',
    ];
  });
  return toCsv([header, ...rows]);
}

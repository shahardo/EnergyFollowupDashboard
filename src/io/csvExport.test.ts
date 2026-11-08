import { describe, expect, it } from 'vitest';
import { baselineDemand, baselineProjects, baselineSupply } from '../data/baseline';
import { demandTotals, projectDemand } from '../model/demand';
import { applyMeasures } from '../model/measures';
import { computeGap } from '../model/gap';
import { computeSupply } from '../model/supply';
import { yearRange } from '../model/years';
import { BOM, demandCsv, projectsCsv, supplyCsv, toCsv } from './csvExport';

describe('csv', () => {
  it('quotes cells with commas and quotes, and rounds numbers', () => {
    expect(toCsv([['a,b', 'x"y', 1.23456]])).toBe(`${BOM}"a,b","x""y",1.235\r\n`);
  });
  it('builds demand and supply tables with one row per year', () => {
    const points = projectDemand(baselineDemand);
    const totals = demandTotals(points);
    const measured = applyMeasures(totals, { efficiencyPct: 10, savingPct: 0 }, 2025, 2050);
    const d = demandCsv(points, measured, baselineDemand.sectors).split('\r\n');
    expect(d[0]).toContain('ביקוש נטו (TWh)');
    expect(d[0].startsWith(BOM + 'שנה,ביתי (TWh)')).toBe(true);
    expect(d[1].startsWith('2025,22,')).toBe(true);
    expect(d).toHaveLength(26 + 2);

    const years = yearRange(2025, 2050);
    const sp = computeSupply(baselineSupply, years);
    const s = supplyCsv(computeGap(totals, sp, baselineSupply), sp, baselineSupply.sources).split('\r\n');
    expect(s[0]).toContain('"סה""כ היצע (TWh)"');
    expect(s).toHaveLength(26 + 2);
  });
  it('builds a projects table', () => {
    const rows = projectsCsv(baselineProjects.projects, baselineProjects.asOf, (k) => k).split('\r\n');
    expect(rows[0].startsWith(BOM + 'פרויקט,ערוץ')).toBe(true);
    expect(rows).toHaveLength(baselineProjects.projects.length + 2);
  });
});

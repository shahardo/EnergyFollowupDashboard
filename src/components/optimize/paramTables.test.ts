import { describe, expect, it } from 'vitest';
import type { RunParameters } from '../../api/client';
import { cellText, formatNumber, paramTable } from './paramTables';
import { displayLog } from './RunLog';

const params: RunParameters = {
  system: {
    modelId: 'm',
    runMode: 'free',
    region: 'ISRAEL',
    years: [2025, 2026],
    timeslices: { DAY: 0.5, NIGHT: 0.5 },
    discountRate: 0.05,
    reserveMargin: 1.15,
    emissionPenalty: 0,
    technologies: 2,
    commodities: 3,
  },
  demand: [
    { commodity: 'A', sector: 'a', label: 'א', values: [1, 2] },
    { commodity: 'B', sector: 'b', label: 'ב', values: [3, 4] },
  ],
  technologies: [
    {
      id: 'PWR_gas', group: 'supply', label: 'גז', source: 'gas', inputs: { NaturalGas: 2 }, outputs: ['Electricity'],
      capex: 1000, opexFixed: 25, opexVariable: 0.83, operatingLife: 30, capacityFactor: 0.9, reserveCredit: 0.95,
      residualCapacity: 11.25, capacityMax: { min: 0, max: 70 }, capacityMin: null, activityMin: null, activityMax: null,
      firstBuildYear: 2026, emission: 0.136,
    },
    {
      id: 'USE_X_ELEC', group: 'endUse', label: 'חימום', carrier: 'electricity', inputs: {}, outputs: ['X'],
      capex: null, opexFixed: null, opexVariable: null, operatingLife: null, capacityFactor: null, reserveCredit: null,
      residualCapacity: null, capacityMax: null, capacityMin: null, activityMin: null, activityMax: null,
      firstBuildYear: null, emission: null,
    },
  ],
  fuels: [{ commodity: 'LNG', source: 'lng', label: 'LNG', price: 9.5, earliestYear: 2030 }],
};

describe('paramTables', () => {
  it('demand has a column per year and a total row', () => {
    const t = paramTable(params, 'demand');
    expect(t.head.slice(1)).toEqual(['2025', '2026']);
    expect(t.rows.at(-1)?.slice(1)).toEqual([4, 6]);
  });

  it('technologies filter by group and label end uses with their carrier', () => {
    expect(paramTable(params, 'technologies', 'supply').rows).toHaveLength(1);
    const all = paramTable(params, 'technologies');
    expect(all.rows).toHaveLength(2);
    expect(all.rows[1][0]).toBe('חימום · חשמל');
    expect(all.rows[0][3]).toBe('NaturalGas ×2');
    expect(all.rows[0][12]).toBe('0–70');
    expect(all.head).toHaveLength(all.rows[0].length);
  });

  it('formats numbers by size', () => {
    expect(formatNumber(1234.56)).toBe('1,235');
    expect(formatNumber(1.234)).toBe('1.23');
    expect(formatNumber(0.0012345)).toBe('0.00123');
    expect(cellText(null)).toBe('—');
  });
});

describe('displayLog', () => {
  it('keeps only the last rewrite of a carriage-return line', () => {
    expect(displayLog('a\nbar 0%\rbar 50%\rbar 100%\nc')).toBe('a\nbar 100%\nc');
    expect(displayLog('x\r\n')).toBe('x\n');
  });
});

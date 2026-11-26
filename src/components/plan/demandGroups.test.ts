import { describe, expect, it } from 'vitest';
import { baselineDemand } from '../../data/baseline';
import { measureNonElectric, projectNonElectric } from '../../model/carriers';
import { projectSubSectors } from '../../model/demand';
import { groupTotal } from '../../model/groups';
import { computeDemandSeries } from '../../model/series';
import { he } from '../../i18n/he';
import { demandGroupKeys, demandGroups } from './demandGroups';

const scenario = baselineDemand;
const { years, demandPoints } = computeDemandSeries(scenario);
const nePoints = projectNonElectric(scenario, demandPoints);
const base = {
  scenario,
  years,
  demandPoints,
  subPoints: projectSubSectors(scenario),
  nePoints,
  withFuels: true,
  elecValue: (p: { energy: number }) => p.energy,
  factor: 1,
  labels: { ...he.groups, carriers: he.plan.carriers, transportFuels: he.plan.transportFuels },
};
const sum = (xs: number[][]) => xs.reduce((a, x) => a.map((v, i) => v + x[i]));

describe('demandGroups', () => {
  it('sectors view: one group per main sector, the heat sectors folded into their parents', () => {
    const groups = demandGroups({ ...base, view: 'sectors' });
    expect(groups.map((g) => g.key)).toEqual(
      ['residential', 'commercial', 'industry', 'transport', 'ai', 'water', 'agri', 'pa'].map((k) => `sector:${k}`),
    );
    const res = groups[0];
    const own = (key: string) => {
      const e = demandPoints.filter((p) => p.sector === key).map((p) => p.energy);
      const ne = nePoints.filter((p) => p.sector === key).map((p) => p.fuels + p.gas);
      return e.map((v, i) => v + ne[i]);
    };
    groupTotal(res).forEach((v, i) =>
      expect(v / (own('residential')[i] + own('heatCoolResidential')[i])).toBeCloseTo(1, 9),
    );
  });
  it('both views add up to the same total', () => {
    const a = sum(demandGroups({ ...base, view: 'sectors' }).map((g) => groupTotal(g)));
    const b = sum(demandGroups({ ...base, view: 'carriers' }).map((g) => groupTotal(g)));
    const m = measureNonElectric(scenario, nePoints, years);
    a.forEach((v, i) => {
      expect(v / b[i]).toBeCloseTo(1, 9);
      const gross = demandPoints.filter((p) => p.year === years[i]).reduce((s, p) => s + p.energy, 0);
      expect(v / (gross + m.fuels[i].grossEnergy + m.gas[i].grossEnergy)).toBeCloseTo(1, 9);
    });
  });
  it('electricity only: no fuels or gas items', () => {
    const groups = demandGroups({ ...base, view: 'carriers', withFuels: false });
    expect(groups.map((g) => g.key)).toEqual(['dcarrier:electricity']);
  });
});

describe('demandGroupKeys', () => {
  it('lists the multi-row main sectors, and the carriers', () => {
    expect(demandGroupKeys(scenario, 'sectors')).toEqual(
      ['residential', 'commercial', 'industry', 'transport', 'agri', 'pa'].map((k) => `sector:${k}`),
    );
    expect(demandGroupKeys(scenario, 'carriers')).toEqual(['dcarrier:electricity', 'dcarrier:fuels', 'dcarrier:gas']);
  });
});

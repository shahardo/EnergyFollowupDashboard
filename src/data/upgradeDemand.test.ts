import { describe, expect, it } from 'vitest';
import type { DemandScenario } from '../schema';
import { baselineDemand } from './baseline';
import { upgradeDemand } from './upgradeDemand';

const old: DemandScenario = {
  id: 'o',
  name: 'old',
  baseYear: 2025,
  horizonYear: 2050,
  sectors: [
    { key: 'residential', label: 'ביתי', baseTWh: 30, growthPct: 2, curve: 'exp', efficiencyPct: 0, loadFactor: 0.5 },
    { key: 'mine', label: 'שלי', baseTWh: 1, growthPct: 1, curve: 'linear', efficiencyPct: 0, loadFactor: 0.5 },
  ],
};

describe('upgradeDemand', () => {
  it('leaves the current baseline unchanged', () => {
    expect(upgradeDemand(baselineDemand)).toBe(baselineDemand);
  });
  it('adds missing baseline sectors in baseline order and keeps edited and unknown ones', () => {
    const up = upgradeDemand(old);
    expect(up.sectors.filter((s) => s.key !== 'mine').map((s) => s.key)).toEqual(
      baselineDemand.sectors.map((s) => s.key),
    );
    expect(up.sectors.some((s) => s.key === 'pa')).toBe(true);
    expect(up.sectors[0].baseTWh).toBe(30);
    expect(up.sectors[up.sectors.length - 1].key).toBe('mine');
    expect(upgradeDemand(up)).toBe(up);
  });
  it('gives a scenario without measures the baseline 7% / 7%, but keeps explicit ones', () => {
    expect(upgradeDemand(old).measures).toEqual({ efficiencyPct: 7, savingPct: 7 });
    const explicit = { ...old, measures: { efficiencyPct: 0, savingPct: 3 } };
    expect(upgradeDemand(explicit).measures).toEqual({ efficiencyPct: 0, savingPct: 3 });
  });
});

describe('upgradeDemand: labels and non-electric demand', () => {
  const transport = baselineDemand.sectors.find((s) => s.key === 'transport')!;
  const legacy: DemandScenario = {
    ...baselineDemand,
    sectors: baselineDemand.sectors.map((s) => {
      if (s.key !== 'transport') return s;
      const { nonElectric: _drop, ...rest } = s;
      void _drop;
      return { ...rest, label: 'תחבורה (חשמול)', growthPct: 9 };
    }),
  };
  it('renames the legacy transport label and fills nonElectric, keeping edits', () => {
    const up = upgradeDemand(legacy).sectors.find((s) => s.key === 'transport')!;
    expect(up.label).toBe('תחבורה');
    expect(up.nonElectric).toEqual(transport.nonElectric);
    expect(up.growthPct).toBe(9);
  });
  it('keeps a custom label', () => {
    const custom = { ...legacy, sectors: legacy.sectors.map((s) => (s.key === 'transport' ? { ...s, label: 'רכב' } : s)) };
    expect(upgradeDemand(custom).sectors.find((s) => s.key === 'transport')!.label).toBe('רכב');
  });
});

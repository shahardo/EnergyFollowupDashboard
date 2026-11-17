import { describe, expect, it } from 'vitest';
import { fromTWh as TWh, toTWh } from '../model/units';
import type { DemandScenario } from '../schema';
import { computeDemandSeries } from '../model/series';
import { baselineDemand, demandPresets } from './baseline';
import { upgradeDemand } from './upgradeDemand';

const old: DemandScenario = {
  id: 'o',
  name: 'old',
  baseYear: 2025,
  horizonYear: 2050,
  sectors: [
    { key: 'residential', label: 'ביתי', baseEnergy: TWh(30), growthRate: 0.02, curve: 'exp', efficiencyRate: 0, loadFactor: 0.5 },
    { key: 'mine', label: 'שלי', baseEnergy: TWh(1), growthRate: 0.01, curve: 'linear', efficiencyRate: 0, loadFactor: 0.5 },
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
    // החימום והקירור הביתי פוצל מהמגזר הביתי שנערך (30%): הסך נשמר.
    expect(toTWh(up.sectors[0].baseEnergy)).toBeCloseTo(21, 9);
    expect(toTWh(up.sectors.find((s) => s.key === 'heatCoolResidential')!.baseEnergy)).toBeCloseTo(9, 9);
    expect(up.sectors[up.sectors.length - 1].key).toBe('mine');
    expect(upgradeDemand(up)).toBe(up);
  });
  it('gives a scenario without measures the baseline 0.07 / 0.07, but keeps explicit ones', () => {
    expect(upgradeDemand(old).measures).toEqual({ efficiency: 0.07, saving: 0.07 });
    const explicit = { ...old, measures: { efficiency: 0, saving: 0.03 } };
    expect(upgradeDemand(explicit).measures).toEqual({ efficiency: 0, saving: 0.03 });
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
      return { ...rest, label: 'תחבורה (חשמול)', growthRate: 0.09 };
    }),
  };
  it('renames the legacy transport label and fills nonElectric, keeping edits', () => {
    const up = upgradeDemand(legacy).sectors.find((s) => s.key === 'transport')!;
    expect(up.label).toBe('תחבורה');
    expect(up.nonElectric).toEqual(transport.nonElectric);
    expect(up.growthRate).toBe(0.09);
  });
  it('keeps a custom label', () => {
    const custom = { ...legacy, sectors: legacy.sectors.map((s) => (s.key === 'transport' ? { ...s, label: 'רכב' } : s)) };
    expect(upgradeDemand(custom).sectors.find((s) => s.key === 'transport')!.label).toBe('רכב');
  });
});

describe('upgradeDemand: split sectors and transport sub-sectors', () => {
  /** תרחיש בפורמט הישן: החימום והקירור מוחזרים לתוך המגזר המקורי, בלי תתי-מגזרים. */
  const merge = (d: DemandScenario): DemandScenario => {
    const by = new Map(d.sectors.map((s) => [s.key, s]));
    const back = (parent: string, child: string) => {
      const p = by.get(parent)!;
      const c = by.get(child)!;
      const ne = p.nonElectric && c.nonElectric && {
        ...p.nonElectric,
        fuels: p.nonElectric.fuels + c.nonElectric.fuels,
        gas: p.nonElectric.gas + c.nonElectric.gas,
      };
      by.set(parent, { ...p, baseEnergy: p.baseEnergy + c.baseEnergy, ...(ne ? { nonElectric: ne } : {}) });
      by.delete(child);
    };
    back('residential', 'heatCoolResidential');
    back('commercial', 'heatCoolCommercial');
    back('industry', 'industrialHeat');
    return {
      ...d,
      sectors: [...by.values()].map((s) => {
        const { subSectors: _drop, ...rest } = s;
        void _drop;
        return rest;
      }),
    };
  };

  it.each(['low', 'medium', 'high'] as const)('keeps the totals of an old %s scenario', (lvl) => {
    const preset = demandPresets[lvl];
    const old = merge(preset);
    const up = upgradeDemand(old, preset);
    expect(up.sectors.map((s) => s.key)).toEqual(preset.sectors.map((s) => s.key));
    const a = computeDemandSeries(up).totals;
    const b = computeDemandSeries(old).totals;
    a.forEach((t, i) => {
      expect(t.energy / b[i].energy).toBeCloseTo(1, 12);
      expect(t.peak / b[i].peak).toBeCloseTo(1, 12);
    });
    // the split reproduces the preset itself
    up.sectors.forEach((s, i) => expect(Math.abs(s.baseEnergy - preset.sectors[i].baseEnergy)).toBeLessThanOrEqual(2));
  });

  it('gives transport the baseline sub-sectors, whose sum is the sector', () => {
    const tr = upgradeDemand(merge(baselineDemand)).sectors.find((s) => s.key === 'transport')!;
    expect(tr.subSectors?.map((s) => s.key)).toEqual([
      'transportPrivate',
      'transportPublic',
      'transportFreight',
      'transportAgri',
      'transportHeavy',
    ]);
    expect(tr.subSectors!.reduce((a, s) => a + s.elecShare, 0)).toBeCloseTo(1, 12);
    expect(tr.subSectors!.reduce((a, s) => a + s.fuelShare, 0)).toBeCloseTo(1, 12);
  });
});

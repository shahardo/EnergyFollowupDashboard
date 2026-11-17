import { describe, expect, it } from 'vitest';
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
    // החימום והקירור הביתי פוצל מהמגזר הביתי שנערך (30%): הסך נשמר.
    expect(up.sectors[0].baseTWh).toBe(21);
    expect(up.sectors.find((s) => s.key === 'heatCoolResidential')!.baseTWh).toBe(9);
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

describe('upgradeDemand: split sectors and transport sub-sectors', () => {
  /** תרחיש בפורמט הישן: החימום והקירור מוחזרים לתוך המגזר המקורי, בלי תתי-מגזרים. */
  const merge = (d: DemandScenario): DemandScenario => {
    const by = new Map(d.sectors.map((s) => [s.key, s]));
    const back = (parent: string, child: string) => {
      const p = by.get(parent)!;
      const c = by.get(child)!;
      const ne = p.nonElectric && c.nonElectric && {
        ...p.nonElectric,
        fuelsTWh: p.nonElectric.fuelsTWh + c.nonElectric.fuelsTWh,
        gasTWh: p.nonElectric.gasTWh + c.nonElectric.gasTWh,
      };
      by.set(parent, { ...p, baseTWh: p.baseTWh + c.baseTWh, ...(ne ? { nonElectric: ne } : {}) });
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
      expect(t.twh).toBeCloseTo(b[i].twh, 9);
      expect(t.peakGW).toBeCloseTo(b[i].peakGW, 9);
    });
    // the split reproduces the preset itself
    up.sectors.forEach((s, i) => expect(s.baseTWh).toBeCloseTo(preset.sectors[i].baseTWh, 9));
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

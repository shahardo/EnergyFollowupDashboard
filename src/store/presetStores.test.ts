import { beforeEach, describe, expect, it } from 'vitest';
import { demandPresets, supplyPresets } from '../data/baseline';
import { useDemandStore } from './demandStore';
import { useSupplyStore } from './supplyStore';

describe('demand store presets', () => {
  beforeEach(() => {
    useDemandStore.getState().select('medium');
    for (const p of ['low', 'medium', 'high'] as const) {
      useDemandStore.getState().select(p);
      useDemandStore.getState().reset();
    }
    useDemandStore.getState().select('medium');
  });

  it('keeps edits per preset when switching', () => {
    const st = useDemandStore.getState;
    st().updateSector('residential', { growthRate: 0.09 });
    st().select('high');
    expect(st().scenario).toBe(st().scenarios.high);
    expect(st().scenario.sectors[0].growthRate).toBe(demandPresets.high.sectors[0].growthRate);
    st().select('medium');
    expect(st().scenario.sectors[0].growthRate).toBe(0.09);
  });

  it('reset restores only the active preset', () => {
    const st = useDemandStore.getState;
    st().updateSector('residential', { growthRate: 0.09 });
    st().select('low');
    st().updateSector('residential', { growthRate: 0.08 });
    st().reset();
    expect(st().scenario.sectors[0].growthRate).toBe(demandPresets.low.sectors[0].growthRate);
    expect(st().scenarios.medium.sectors[0].growthRate).toBe(0.09);
  });

  it('a file with a preset loads into that slot; one without goes to the active slot', () => {
    const st = useDemandStore.getState;
    st().setScenario({ ...demandPresets.high, name: 'mine' });
    expect(st().active).toBe('high');
    expect(st().scenarios.high.name).toBe('mine');
    const { preset: _drop, ...noPreset } = demandPresets.low;
    void _drop;
    st().setScenario({ ...noPreset, name: 'loose' });
    expect(st().active).toBe('high');
    expect(st().scenario.name).toBe('loose');
    expect(st().scenario.preset).toBe('high');
  });
});

describe('supply store presets', () => {
  it('auto-fill undo and switching keep the active slot in sync', () => {
    const st = useSupplyStore.getState;
    useDemandStore.getState().select('medium');
    st().select('tested');
    const before = st().scenario;
    st().applyAutoFill({ ...before, name: 'filled' });
    expect(st().scenarios.medium.tested.name).toBe('filled');
    st().undoAutoFill();
    expect(st().scenarios.medium.tested).toBe(before);
    st().applyAutoFill({ ...before, name: 'filled' });
    st().select('reference');
    expect(st().previous).toBeNull();
    expect(st().scenario).toEqual(supplyPresets.medium.reference);
  });

  it('a manual edit after auto-fill clears undo, so undo cannot wipe the edit', () => {
    const st = useSupplyStore.getState;
    useDemandStore.getState().select('medium');
    st().select('declared');
    st().applyAutoFill({ ...st().scenario, name: 'filled' });
    expect(st().previous).not.toBeNull();
    st().updateSource('solar', { maxPower: 99e9 });
    expect(st().previous).toBeNull();
    st().undoAutoFill();
    expect(st().scenario.sources.find((s) => s.key === 'solar')!.maxPower).toBe(99e9);
    st().reset();
  });

  it('follows the selected demand preset and keeps edits per demand row', () => {
    const st = useSupplyStore.getState;
    useDemandStore.getState().select('medium');
    st().select('declared');
    st().updateSource('solar', { enabled: false });
    useDemandStore.getState().select('high');
    expect(st().demandPreset).toBe('high');
    expect(st().scenario).toBe(st().scenarios.high.declared);
    expect(st().scenario.sources.find((s) => s.key === 'solar')!.enabled).toBe(true);
    useDemandStore.getState().select('medium');
    expect(st().scenario.sources.find((s) => s.key === 'solar')!.enabled).toBe(false);
    st().reset();
    expect(st().scenario).toEqual(supplyPresets.medium.declared);
  });

  it('opening a supply file built for another demand switches the demand too', () => {
    useDemandStore.getState().select('medium');
    useSupplyStore.getState().setScenario({ ...supplyPresets.low.tested, name: 'from file' });
    expect(useDemandStore.getState().active).toBe('low');
    expect(useSupplyStore.getState().active).toBe('tested');
    expect(useSupplyStore.getState().scenario.name).toBe('from file');
  });
});

describe('supply store: scenario-planning rules', () => {
  it('rewrites only that source and gas, keeps other edits, and follows the menus', async () => {
    const { computeDemandSeries } = await import('../model/series');
    const { planPresets } = await import('../data/scenarioPlan');
    const sup = useSupplyStore.getState;
    useDemandStore.getState().select('medium');
    sup().select('declared');
    sup().reset();
    const totals = computeDemandSeries(useDemandStore.getState().scenario).totals;
    sup().updateSource('wind', { capacity: [{ year: 2025, power: 3e9 }] });
    const gas0 = sup().scenario.sources.find((s) => s.key === 'gas')!.capacity;
    sup().setPlanParam('solar', { slope: 2e9 }, totals);
    const sc = sup().scenario;
    expect(sc.planParams!.solar.slope).toBe(2e9);
    expect(sc.sources.find((s) => s.key === 'wind')!.capacity).toEqual([{ year: 2025, power: 3e9 }]);
    const solar2050 = sc.sources.find((s) => s.key === 'solar')!.capacity.at(-1)!.power;
    expect(solar2050 / 1e9).toBeCloseTo(planPresets.declared.solar.base / 1e9 + 50, 1);
    expect(sc.sources.find((s) => s.key === 'gas')!.capacity).not.toEqual(gas0);
    sup().select('tested');
    expect(sup().scenario.planParams).toEqual(planPresets.tested);
    sup().select('declared');
    sup().reset();
    expect(sup().scenario.planParams).toEqual(planPresets.declared);
  });
});

describe('persisted state from before SI (v1 shapes)', () => {
  it('demand and supply state saved in TWh / GW is converted on load', async () => {
    const demandV1 = (await import('../io/fixtures/v1-demand-medium.json')).default.data;
    const supplyV1 = (await import('../io/fixtures/v1-supply-medium-declared.json')).default.data;
    const dOpts = useDemandStore.persist.getOptions();
    const d = dOpts.migrate!({ active: 'medium', scenarios: { medium: demandV1 } }, 3) as {
      scenarios: Record<string, unknown>;
    };
    expect(d.scenarios.medium).toEqual(demandPresets.medium);
    const sOpts = useSupplyStore.persist.getOptions();
    const s = sOpts.migrate!({ active: 'declared', scenarios: { medium: { declared: supplyV1 } } }, 4) as {
      scenarios: Record<string, Record<string, { sources: { capacity: { power: number }[] }[] }>>;
    };
    const solar = s.scenarios.medium.declared.sources.find((x) => (x as unknown as { key: string }).key === 'solar')!;
    expect(solar.capacity.at(-1)!.power).toBeCloseTo(
      supplyPresets.medium.declared.sources.find((x) => x.key === 'solar')!.capacity.at(-1)!.power,
      0,
    );
  });
});

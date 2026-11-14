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
    st().updateSector('residential', { growthPct: 9 });
    st().select('high');
    expect(st().scenario).toBe(st().scenarios.high);
    expect(st().scenario.sectors[0].growthPct).toBe(demandPresets.high.sectors[0].growthPct);
    st().select('medium');
    expect(st().scenario.sectors[0].growthPct).toBe(9);
  });

  it('reset restores only the active preset', () => {
    const st = useDemandStore.getState;
    st().updateSector('residential', { growthPct: 9 });
    st().select('low');
    st().updateSector('residential', { growthPct: 8 });
    st().reset();
    expect(st().scenario.sectors[0].growthPct).toBe(demandPresets.low.sectors[0].growthPct);
    expect(st().scenarios.medium.sectors[0].growthPct).toBe(9);
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
    st().updateSource('solar', { maxGW: 99 });
    expect(st().previous).toBeNull();
    st().undoAutoFill();
    expect(st().scenario.sources.find((s) => s.key === 'solar')!.maxGW).toBe(99);
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
    sup().updateSource('wind', { capacityGW: [{ year: 2025, gw: 3 }] });
    const gas0 = sup().scenario.sources.find((s) => s.key === 'gas')!.capacityGW;
    sup().setPlanParam('solar', { slopeGW: 2 }, totals);
    const sc = sup().scenario;
    expect(sc.planParams!.solar.slopeGW).toBe(2);
    expect(sc.sources.find((s) => s.key === 'wind')!.capacityGW).toEqual([{ year: 2025, gw: 3 }]);
    const solar2050 = sc.sources.find((s) => s.key === 'solar')!.capacityGW.at(-1)!.gw;
    expect(solar2050).toBeCloseTo(planPresets.declared.solar.baseGW + 50, 1);
    expect(sc.sources.find((s) => s.key === 'gas')!.capacityGW).not.toEqual(gas0);
    sup().select('tested');
    expect(sup().scenario.planParams).toEqual(planPresets.tested);
    sup().select('declared');
    sup().reset();
    expect(sup().scenario.planParams).toEqual(planPresets.declared);
  });
});

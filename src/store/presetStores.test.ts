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
    st().select('tested');
    const before = st().scenario;
    st().applyAutoFill({ ...before, name: 'filled' });
    expect(st().scenarios.tested.name).toBe('filled');
    st().undoAutoFill();
    expect(st().scenarios.tested).toBe(before);
    st().applyAutoFill({ ...before, name: 'filled' });
    st().select('reference');
    expect(st().previous).toBeNull();
    expect(st().scenario.sources.find((s) => s.key === 'gas')).toEqual(
      supplyPresets.reference.sources.find((s) => s.key === 'gas'),
    );
  });
});

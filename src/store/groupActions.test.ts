import { beforeEach, describe, expect, it } from 'vitest';
import { useDemandStore } from './demandStore';
import { useSupplyStore } from './supplyStore';
import { useUiStore } from './uiStore';

beforeEach(() => {
  useDemandStore.getState().reset();
  useSupplyStore.getState().reset();
});

describe('group actions', () => {
  it('updateSectors patches several sectors at once', () => {
    useDemandStore.getState().updateSectors({ residential: { growthRate: 0.05 }, commercial: { growthRate: 0.04 } });
    const s = useDemandStore.getState().scenario.sectors;
    expect(s.find((x) => x.key === 'residential')!.growthRate).toBe(0.05);
    expect(s.find((x) => x.key === 'commercial')!.growthRate).toBe(0.04);
  });
  it('updateSources patches several sources at once', () => {
    useSupplyStore.getState().updateSources({ solar: { enabled: false }, wind: { enabled: false } });
    const s = useSupplyStore.getState().scenario.sources;
    expect(s.find((x) => x.key === 'solar')!.enabled).toBe(false);
    expect(s.find((x) => x.key === 'wind')!.enabled).toBe(false);
  });
  it('toggleExpanded adds and removes a key', () => {
    const { toggleExpanded } = useUiStore.getState();
    toggleExpanded('cat:solar');
    expect(useUiStore.getState().expanded).toContain('cat:solar');
    toggleExpanded('cat:solar');
    expect(useUiStore.getState().expanded).not.toContain('cat:solar');
  });
});

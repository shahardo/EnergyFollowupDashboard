import { describe, expect, it } from 'vitest';
import type { SupplyScenario } from '../schema';
import { baselineSupply } from './baseline';
import { upgradeSupply } from './upgradeSupply';

const old: SupplyScenario = {
  id: 'o',
  name: 'old',
  fillPriority: ['solar', 'import'],
  sources: [
    {
      key: 'solar',
      label: 'סולארי',
      enabled: true,
      renewable: true,
      capacityGW: [{ year: 2025, gw: 9 }],
      capacityFactor: 0.2,
      capacityCredit: 0.05,
    },
    {
      key: 'import',
      label: 'יבוא',
      enabled: true,
      renewable: false,
      capacityGW: [{ year: 2025, gw: 3 }],
      capacityFactor: 0.6,
      capacityCredit: 0.7,
    },
    {
      key: 'mine',
      label: 'שלי',
      enabled: true,
      renewable: false,
      capacityGW: [{ year: 2025, gw: 1 }],
      capacityFactor: 0.5,
      capacityCredit: 0.5,
    },
  ],
};

describe('upgradeSupply', () => {
  it('leaves the current baseline unchanged', () => {
    expect(upgradeSupply(baselineSupply)).toBe(baselineSupply);
  });
  it('turns the legacy import into electricity import, keeping its values', () => {
    const up = upgradeSupply(old);
    const imp = up.sources.find((s) => s.key === 'importElectricity')!;
    expect(imp.capacityGW).toEqual([{ year: 2025, gw: 3 }]);
    expect(imp.enabled).toBe(true);
    expect(up.sources.some((s) => s.key === 'import')).toBe(false);
    expect(up.fillPriority).toEqual(['solar', 'importElectricity']);
  });
  it('adds missing baseline sources in baseline order, keeps edited and unknown ones', () => {
    const up = upgradeSupply(old);
    const known = up.sources.filter((s) => s.key !== 'mine').map((s) => s.key);
    expect(known).toEqual(baselineSupply.sources.map((s) => s.key));
    expect(up.sources.find((s) => s.key === 'solar')!.capacityGW[0].gw).toBe(9);
    expect(up.sources[up.sources.length - 1].key).toBe('mine');
    expect(upgradeSupply(up)).toBe(up);
  });
});

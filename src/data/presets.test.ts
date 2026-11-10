import { describe, expect, it } from 'vitest';
import { demandTotals, projectDemand } from '../model/demand';
import { applyMeasures } from '../model/measures';
import { computeSupply } from '../model/supply';
import { DEMAND_PRESETS, SUPPLY_PRESETS, demandPresets, supplyPresets } from './baseline';
import { upgradeDemand } from './upgradeDemand';
import { upgradeSupply } from './upgradeSupply';

const netTWh2050 = (p: (typeof DEMAND_PRESETS)[number]) => {
  const s = demandPresets[p];
  const totals = demandTotals(projectDemand(s));
  return applyMeasures(totals, s.measures, s.baseYear, s.horizonYear).at(-1)!.netTWh;
};

describe('scenario presets', () => {
  it('each preset carries its own key and has the full sector / source list', () => {
    for (const p of DEMAND_PRESETS) {
      expect(demandPresets[p].preset).toBe(p);
      expect(upgradeDemand(demandPresets[p])).toBe(demandPresets[p]);
    }
    for (const p of SUPPLY_PRESETS) {
      expect(supplyPresets[p].preset).toBe(p);
      expect(upgradeSupply(supplyPresets[p])).toBe(supplyPresets[p]);
    }
  });
  it('demand grows from low to high', () => {
    expect(netTWh2050('low')).toBeLessThan(netTWh2050('medium'));
    expect(netTWh2050('medium')).toBeLessThan(netTWh2050('high'));
  });
  it('the renewable share in 2050 rises from reference to declared to tested', () => {
    const share = (p: (typeof SUPPLY_PRESETS)[number]) => {
      const pts = computeSupply(supplyPresets[p], [2050]);
      const total = pts.reduce((a, x) => a + x.twh, 0);
      const ren = pts
        .filter((x) => supplyPresets[p].sources.find((s) => s.key === x.source)?.renewable)
        .reduce((a, x) => a + x.twh, 0);
      return ren / total;
    };
    expect(share('reference')).toBeLessThan(share('declared'));
    expect(share('declared')).toBeLessThan(share('tested'));
  });
});

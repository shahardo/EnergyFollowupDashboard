import { describe, expect, it } from 'vitest';
import { demandTotals, projectDemand } from '../model/demand';
import { computeGap } from '../model/gap';
import { applyMeasures, netTotals } from '../model/measures';
import { computeSupply } from '../model/supply';
import { yearRange } from '../model/years';
import type { DemandPreset, SupplyPreset } from '../schema';
import { DEMAND_PRESETS, SUPPLY_PRESETS, demandPresets, supplyPresets } from './baseline';
import { upgradeDemand } from './upgradeDemand';
import { upgradeSupply } from './upgradeSupply';

const net = (p: DemandPreset) => {
  const s = demandPresets[p];
  return netTotals(applyMeasures(demandTotals(projectDemand(s)), s.measures, s.baseYear, s.horizonYear));
};
const gapFor = (d: DemandPreset, p: SupplyPreset) => {
  const s = supplyPresets[d][p];
  const dem = demandPresets[d];
  return computeGap(net(d), computeSupply(s, yearRange(dem.baseYear, dem.horizonYear)), s);
};

describe('scenario presets', () => {
  it('each preset carries its own keys and has the full sector / source list', () => {
    for (const d of DEMAND_PRESETS) {
      expect(demandPresets[d].preset).toBe(d);
      expect(upgradeDemand(demandPresets[d])).toBe(demandPresets[d]);
      for (const p of SUPPLY_PRESETS) {
        const s = supplyPresets[d][p];
        expect(s.preset).toBe(p);
        expect(s.demandPreset).toBe(d);
        expect(upgradeSupply(s)).toBe(s);
      }
    }
  });
  it('demand grows from low to high', () => {
    const at2050 = (p: DemandPreset) => net(p).at(-1)!.twh;
    expect(at2050('low')).toBeLessThan(at2050('medium'));
    expect(at2050('medium')).toBeLessThan(at2050('high'));
  });
  it('every supply preset meets its demand (energy and peak) in every year', () => {
    for (const d of DEMAND_PRESETS) {
      for (const p of SUPPLY_PRESETS) {
        for (const g of gapFor(d, p)) {
          expect(g.gapTWh, `${d}/${p} energy ${g.year}`).toBeLessThan(1e-6);
          expect(g.peakGapGW, `${d}/${p} peak ${g.year}`).toBeLessThan(1e-6);
        }
      }
    }
  });
  it('no preset goes over a source maxGW', () => {
    for (const d of DEMAND_PRESETS)
      for (const p of SUPPLY_PRESETS)
        for (const s of supplyPresets[d][p].sources)
          if (s.maxGW !== undefined) for (const c of s.capacityGW) expect(c.gw).toBeLessThanOrEqual(s.maxGW + 1e-9);
  });
  it('for every demand, the 2050 renewable share rises from reference to declared to tested', () => {
    for (const d of DEMAND_PRESETS) {
      const share = (p: SupplyPreset) => gapFor(d, p).at(-1)!.renewablePct;
      expect(share('reference')).toBeLessThan(share('declared'));
      expect(share('declared')).toBeLessThan(share('tested'));
    }
  });
});

import { describe, expect, it } from 'vitest';
import { applyMeasures, netTotals, rampShare } from './measures';
import { fromGW as GW, fromTWh as TWh, toGW, toTWh } from './units';

const totals = [
  { year: 2025, energy: TWh(100), peak: GW(20) },
  { year: 2050, energy: TWh(200), peak: GW(40) },
];

describe('measures', () => {
  it('ramps from 0 at the base year to 1 at the horizon', () => {
    expect(rampShare(2025, 2025, 2050)).toBe(0);
    expect(rampShare(2037.5, 2025, 2050)).toBeCloseTo(0.5);
    expect(rampShare(2060, 2025, 2050)).toBe(1);
  });
  it('does nothing without measures', () => {
    const m = applyMeasures(totals, undefined, 2025, 2050);
    expect(m[1].netEnergy).toBe(TWh(200));
  });
  it('efficiency 0.2 lowers horizon energy and peak by 20%', () => {
    const m = applyMeasures(totals, { efficiency: 0.2, saving: 0 }, 2025, 2050);
    expect(m[0].netEnergy).toBe(TWh(100));
    expect(toTWh(m[1].netEnergy)).toBeCloseTo(160);
    expect(toGW(m[1].netPeak)).toBeCloseTo(32);
    expect(toTWh(m[1].efficiencyEnergy)).toBeCloseTo(40);
  });
  it('combines multiplicatively: 0.2 then 0.1 is 0.28', () => {
    const m = applyMeasures(totals, { efficiency: 0.2, saving: 0.1 }, 2025, 2050);
    expect(toTWh(m[1].netEnergy)).toBeCloseTo(144);
    expect(toTWh(m[1].efficiencyEnergy + m[1].savingEnergy)).toBeCloseTo(56);
    expect(netTotals(m)[1]).toEqual({ year: 2050, energy: m[1].netEnergy, peak: m[1].netPeak });
  });
});

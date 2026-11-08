import { describe, expect, it } from 'vitest';
import { applyMeasures, netTotals, rampShare } from './measures';

const totals = [
  { year: 2025, twh: 100, peakGW: 20 },
  { year: 2050, twh: 200, peakGW: 40 },
];

describe('measures', () => {
  it('ramps from 0 at the base year to 1 at the horizon', () => {
    expect(rampShare(2025, 2025, 2050)).toBe(0);
    expect(rampShare(2037.5, 2025, 2050)).toBeCloseTo(0.5);
    expect(rampShare(2060, 2025, 2050)).toBe(1);
  });
  it('does nothing without measures', () => {
    const m = applyMeasures(totals, undefined, 2025, 2050);
    expect(m[1].netTWh).toBe(200);
  });
  it('efficiency 20% lowers horizon energy and peak by 20%', () => {
    const m = applyMeasures(totals, { efficiencyPct: 20, savingPct: 0 }, 2025, 2050);
    expect(m[0].netTWh).toBe(100);
    expect(m[1].netTWh).toBeCloseTo(160);
    expect(m[1].netPeakGW).toBeCloseTo(32);
    expect(m[1].efficiencyTWh).toBeCloseTo(40);
  });
  it('combines multiplicatively: 20% then 10% is 28%', () => {
    const m = applyMeasures(totals, { efficiencyPct: 20, savingPct: 10 }, 2025, 2050);
    expect(m[1].netTWh).toBeCloseTo(144);
    expect(m[1].efficiencyTWh + m[1].savingTWh).toBeCloseTo(56);
    expect(netTotals(m)[1]).toEqual({ year: 2050, twh: m[1].netTWh, peakGW: m[1].netPeakGW });
  });
});

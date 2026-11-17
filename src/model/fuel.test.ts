import { describe, expect, it } from 'vitest';
import { factorOf, factorsOf, fuelRatios, sourceCo2, sourceGasVolume, sourcePrimaryEnergy } from './fuel';
import { fromTWh as TWh, J_PER_M3_GAS, KG_PER_MT, toBCM, toMt } from './units';

const pt = (year: number, source: string, twh: number) => ({ year, source, energy: TWh(twh), power: 0, firmPower: 0 });

describe('fuel', () => {
  it('renewables convert 1:1, fuels by plant efficiency', () => {
    expect(sourcePrimaryEnergy(factorOf('solar'), TWh(10))).toBeCloseTo(TWh(10));
    expect(sourcePrimaryEnergy(factorOf('gas'), TWh(10)) / TWh(20)).toBeCloseTo(1, 12);
    expect(sourcePrimaryEnergy(factorOf('unknown'), 1)).toBe(1);
  });

  it('only gas sources use gas: 10.3 TWh of electricity at 50% is 2 BCM', () => {
    expect(toBCM(sourceGasVolume(factorOf('gas'), TWh(10.3)))).toBeCloseTo(2);
    expect(toBCM(sourceGasVolume(factorOf('lng'), TWh(10.3) / 2))).toBeCloseTo(1);
    expect(sourceGasVolume(factorOf('coal'), TWh(50))).toBe(0);
    expect(sourceGasVolume(factorOf('solar'), TWh(50))).toBe(0);
  });

  it('a source with its own fields overrides the defaults', () => {
    const f = factorOf({ key: 'gas', efficiency: 0.25, emissionFactor: 1e-7, inputFuel: 'Coal' });
    expect(f).toEqual({ efficiency: 0.25, emissionFactor: 1e-7, burnsGas: false });
    expect(factorOf({ key: 'x', inputFuel: 'NaturalGas' }).burnsGas).toBe(true);
  });

  it('emissions by source factor, 0 for electricity import and unknown keys', () => {
    expect(toMt(sourceCo2(factorOf('gas'), TWh(10)))).toBeCloseTo(4.9);
    expect(toMt(sourceCo2(factorOf('coal'), TWh(10)))).toBeCloseTo(8.2);
    expect(sourceCo2(factorOf('importElectricity'), TWh(10))).toBe(0);
    expect(sourceCo2(factorOf('unknown'), TWh(10))).toBe(0);
  });

  it('ratios follow the yearly mix, 0 without supply', () => {
    const r = fuelRatios([pt(2030, 'gas', 10), pt(2030, 'solar', 10)], [2030, 2031], factorsOf([]));
    expect(r[0].primaryPerJ).toBeCloseTo(30 / 20);
    expect(r[0].gasVolumePerJ * J_PER_M3_GAS).toBeCloseTo(20 / 20);
    expect((r[0].co2PerJ * TWh(1)) / KG_PER_MT).toBeCloseTo((4.9 + 0.48) / 20);
    expect(r[1]).toEqual({ year: 2031, primaryPerJ: 0, gasVolumePerJ: 0, co2PerJ: 0 });
  });
});

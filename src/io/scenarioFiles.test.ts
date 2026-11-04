import { describe, expect, it } from 'vitest';
import { baselineDemand, baselineSupply } from '../data/baseline';
import { parseScenarioText, ScenarioFileError, serialize } from './scenarioFiles';

describe('scenario files', () => {
  it('round-trips demand and supply', () => {
    expect(parseScenarioText(serialize('demand', baselineDemand))).toEqual({ kind: 'demand', data: baselineDemand });
    expect(parseScenarioText(serialize('supply', baselineSupply))).toEqual({ kind: 'supply', data: baselineSupply });
  });
  it('rejects invalid JSON, wrong version and bad data', () => {
    expect(() => parseScenarioText('{')).toThrow(ScenarioFileError);
    expect(() => parseScenarioText(JSON.stringify({ schema: 'x/v9', kind: 'demand' }))).toThrow(/גרסת/);
    const bad = JSON.parse(serialize('demand', baselineDemand));
    bad.data.sectors[0].loadFactor = 3;
    expect(() => parseScenarioText(JSON.stringify(bad))).toThrow(/loadFactor/);
  });
});

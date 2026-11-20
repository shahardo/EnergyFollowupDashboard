import { describe, expect, it } from 'vitest';
import { baselineProjects, demandPresets, supplyPresets } from '../data/baseline';
import { upgradeSupply } from '../data/upgradeSupply';
import demandV1 from './fixtures/v1-demand-medium.json';
import projectsV1 from './fixtures/v1-projects.json';
import supplyV1 from './fixtures/v1-supply-medium-declared.json';
import { parseScenarioText } from './scenarioFiles';

// קבצים מפורמט v1 (TWh / GW / אחוזים, כפי שנשמרו לפני המעבר ל-SI) נפתחים ומומרים לאותם נתונים כמו התרחישים
// המוכנים הנוכחיים.
describe('v1 files', () => {
  it('a v1 demand file becomes the v2 preset', () => {
    const r = parseScenarioText(JSON.stringify(demandV1));
    expect(r.kind).toBe('demand');
    expect(r.data).toEqual(demandPresets.medium);
  });
  it('a v1 supply file becomes the v2 preset once the economics are filled in', () => {
    const r = parseScenarioText(JSON.stringify(supplyV1));
    if (r.kind !== 'supply') throw new Error(r.kind);
    const preset = supplyPresets.medium.declared;
    expect(r.data.sources[0].capitalCost).toBeUndefined();
    const up = upgradeSupply(r.data, preset);
    expect(up.sources.map((s) => s.key)).toEqual(preset.sources.map((s) => s.key));
    up.sources.forEach((s, i) => {
      const p = preset.sources[i];
      expect(s.capacity.length).toBe(p.capacity.length);
      s.capacity.forEach((c, j) => expect(c.power).toBeCloseTo(p.capacity[j].power, 0));
      expect({ ...s, capacity: [] }).toEqual({ ...p, capacity: [] });
    });
  });
  it('a v1 tasks file becomes the v2 sample tasks', () => {
    const r = parseScenarioText(JSON.stringify(projectsV1));
    expect(r.data).toEqual(baselineProjects);
  });
  it('an unknown schema version is refused', () => {
    expect(() => parseScenarioText(JSON.stringify({ ...demandV1, schema: 'energy-dashboard/v9' }))).toThrow();
  });
});

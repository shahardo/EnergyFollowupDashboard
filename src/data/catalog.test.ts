import { describe, expect, it } from 'vitest';
import { sectorColors, sourceColors } from '../components/charts/palette';
import { DEMAND_PRESETS, demandPresets, SUPPLY_PRESETS, supplyPresets } from './baseline';
import { catalog } from './catalog';
import { defaultMaxGW, trilemmaScores } from './trilemma';
import { baselineProjects } from './baseline';

const sectorKeys = catalog.sectors.map((s) => s.key);
const subKeys = catalog.sectors.flatMap((s) => (s.subSectors ?? []).map((x) => x.key));
const sourceKeys = catalog.sources.map((s) => s.key);

describe('catalog: dashboard side', () => {
  it.each(DEMAND_PRESETS)('every %s demand sector and sub-sector is in the catalogue, and vice versa', (p) => {
    const d = demandPresets[p];
    expect(d.sectors.map((s) => s.key)).toEqual(sectorKeys);
    expect(d.sectors.flatMap((s) => (s.subSectors ?? []).map((x) => x.key))).toEqual(subKeys);
  });
  it('every catalogue sector maps to a model commodity (directly or through its sub-sectors)', () => {
    for (const s of catalog.sectors) expect(s.commodity ?? s.subSectors?.length).toBeTruthy();
  });
  it('sub-sector shares sum to 1', () => {
    for (const s of catalog.sectors.filter((x) => x.subSectors)) {
      expect(s.subSectors!.reduce((a, x) => a + x.elecShare, 0)).toBeCloseTo(1, 12);
      expect(s.subSectors!.reduce((a, x) => a + x.fuelShare, 0)).toBeCloseTo(1, 12);
    }
  });
  it.each(DEMAND_PRESETS.flatMap((d) => SUPPLY_PRESETS.map((p) => [d, p] as const)))(
    'every %s/%s supply source is in the catalogue, in catalogue order',
    (d, p) => expect(supplyPresets[d][p].sources.map((s) => s.key)).toEqual(sourceKeys),
  );
  it('every sector, sub-sector and source has a colour, and every source sample scores, a cap and tasks', () => {
    for (const k of [...sectorKeys, ...subKeys]) expect(sectorColors[k], k).toBeDefined();
    const tasks = new Set(baselineProjects.projects.map((t) => t.channel));
    for (const k of sourceKeys) {
      expect(sourceColors[k], k).toBeDefined();
      expect(trilemmaScores[k], k).toBeDefined();
      expect(k in defaultMaxGW, k).toBe(true);
      expect(tasks.has(k), k).toBe(true);
    }
  });
  it('model technologies are not claimed twice', () => {
    const techs = catalog.sources.flatMap((s) => s.technologies);
    expect(new Set(techs).size).toBe(techs.length);
  });
});

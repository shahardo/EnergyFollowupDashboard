import { describe, expect, it } from 'vitest';
import { buildPyramid, groundPoint, project, viewDir } from './pyramid';

const score = { security: 8, affordability: 6, sustainability: 4, feasibilityPct: 50 };

describe('pyramid', () => {
  it('puts the security axis at the back of the floor', () => {
    const [x, y, z] = groundPoint('security', 10, 40);
    expect(x).toBeCloseTo(0);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(40);
    expect(groundPoint('affordability', 10, 40)[2]).toBeLessThan(0);
  });

  it('projects depth foreshortened and height straight up', () => {
    expect(project([0, 0, 0], 100, 100)).toEqual([100, 100]);
    expect(project([10, 0, 20], 100, 100, 0.5, 0)).toEqual([110, 90]);
    expect(project([0, 30, 0], 100, 100)).toEqual([100, 70]);
    // סיבוב של 90°: העומק הופך לציר האופקי
    const [x, y] = project([0, 0, 20], 100, 100, 0.5, Math.PI / 2);
    expect(x).toBeCloseTo(80);
    expect(y).toBeCloseTo(100);
  });

  it('points along the view direction project to the same screen point', () => {
    const v = viewDir();
    const a = project([0, 0, 0], 0, 0);
    const b = project([v[0] * 10, v[1] * 10, v[2] * 10], 0, 0);
    expect(b[0]).toBeCloseTo(a[0]);
    expect(b[1]).toBeCloseTo(a[1]);
  });

  it('height scales with feasibility, apex above the base centroid', () => {
    const p = buildPyramid(score, 70, 100);
    expect(p.height).toBe(50);
    expect(p.apex[0]).toBeCloseTo(p.centroid[0]);
    expect(p.apex[2]).toBeCloseTo(p.centroid[2]);
    expect(buildPyramid({ ...score, feasibilityPct: 100 }, 70, 100).height).toBe(100);
    expect(buildPyramid({ ...score, feasibilityPct: 150 }, 70, 100).height).toBe(100);
  });

  it('normals point outwards and the front face is visible', () => {
    const p = buildPyramid(score, 70, 100);
    for (const f of p.faces) {
      const mid = f.points.reduce((s, q) => [s[0] + q[0] / 3, s[1] + q[1] / 3, s[2] + q[2] / 3], [0, 0, 0]);
      const out = [mid[0] - p.centroid[0], mid[1] - p.height / 4, mid[2] - p.centroid[2]];
      expect(f.normal[0] * out[0] + f.normal[1] * out[1] + f.normal[2] * out[2]).toBeGreaterThan(0);
    }
    // הפאה הקדמית: מחיר–קיימות
    expect(p.faces[1].visible).toBe(true);
    expect(p.faces[1].normal[2]).toBeLessThan(0);
  });

  it('a tall pyramid hides the back faces; a flat one shows the floor triangle', () => {
    const sym = { security: 10, affordability: 10, sustainability: 10 };
    const tall = buildPyramid({ ...sym, feasibilityPct: 100 }, 50, 400);
    expect(tall.faces.map((f) => f.visible)).toEqual([false, true, false]);
    const flat = buildPyramid({ ...sym, feasibilityPct: 0 }, 50, 100);
    expect(flat.faces.every((f) => f.visible)).toBe(true);
  });

  it('degenerate base faces are not drawn', () => {
    const p = buildPyramid({ security: 0, affordability: 0, sustainability: 0, feasibilityPct: 0 }, 50, 100);
    expect(p.faces.some((f) => f.visible)).toBe(false);
  });
});

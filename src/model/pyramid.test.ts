import { describe, expect, it } from 'vitest';
import { buildPyramid, groundPoint, normalizeYaw, project, viewDir } from './pyramid';

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

  it('rotates around the pivot, which stays at (cx, cy)', () => {
    const pivot: [number, number, number] = [12, 0, -7];
    for (const yaw of [0, 1, 2.5, -2]) {
      const [x, y] = project(pivot, 50, 60, 0.5, yaw, pivot);
      expect(x).toBeCloseTo(50);
      expect(y).toBeCloseTo(60);
    }
    // הגובה מעל ה-pivot עולה ישר למעלה
    expect(project([12, 30, -7], 50, 60, 0.5, 1, pivot)[1]).toBeCloseTo(30);
  });

  it('normalizes yaw to -π..π', () => {
    expect(normalizeYaw(0)).toBeCloseTo(0);
    expect(normalizeYaw(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(normalizeYaw(-0.5 + 4 * Math.PI)).toBeCloseTo(-0.5);
    expect(normalizeYaw(-4)).toBeCloseTo(-4 + 2 * Math.PI);
  });

  it('turning 180° shows the back faces instead of the front one', () => {
    const sym = { security: 10, affordability: 10, sustainability: 10, feasibilityPct: 100 };
    const front = buildPyramid(sym, 50, 400, 0);
    const back = buildPyramid(sym, 50, 400, Math.PI);
    expect(front.faces.map((f) => f.visible)).toEqual([false, true, false]);
    expect(back.faces.map((f) => f.visible)).toEqual([true, false, true]);
  });

  it('the light turns with the view: the face toward the viewer is lit the same at any yaw', () => {
    const sym = { security: 10, affordability: 10, sustainability: 10, feasibilityPct: 60 };
    // מחיר–קיימות פונה לצופה ב-yaw 0; קיימות–ביטחון אחרי סיבוב של 120°
    const a = buildPyramid(sym, 50, 100, 0).faces[1].light;
    const b = buildPyramid(sym, 50, 100, (-2 * Math.PI) / 3).faces[2].light;
    expect(b).toBeCloseTo(a);
    expect(a).toBeGreaterThan(0.3);
  });
});

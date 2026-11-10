import { describe, expect, it } from 'vitest';
import { axisPoint, feasibilityColor, trianglePoints, trilemmaHue } from './trilemma';

describe('trilemma', () => {
  it('places the security axis straight up and scales by value', () => {
    const [x, y] = axisPoint('security', 10, 50, 50, 40);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(10);
    expect(axisPoint('security', 5, 50, 50, 40)[1]).toBeCloseTo(30);
    expect(axisPoint('affordability', 0, 50, 50, 40)).toEqual([50, 50]);
  });
  it('clamps values to 0..10', () => {
    expect(axisPoint('security', 20, 0, 0, 10)[1]).toBeCloseTo(-10);
  });
  it('the bottom vertices are symmetric', () => {
    const [, a, s] = trianglePoints(
      { security: 0, affordability: 10, sustainability: 10, feasibilityPct: 50 },
      0,
      0,
      1,
    );
    expect(a[0]).toBeCloseTo(-s[0]);
    expect(a[1]).toBeCloseTo(s[1]);
    expect(a[1]).toBeGreaterThan(0);
  });
  it('lower feasibility means less saturation and more lightness (towards light gray)', () => {
    expect(feasibilityColor(200, 100)).toBe('hsl(200 72% 48%)');
    expect(feasibilityColor(200, 0)).toBe('hsl(200 0% 80%)');
    expect(feasibilityColor(200, 50)).toBe('hsl(200 36% 64%)');
  });
  it('hues are spread around the wheel', () => {
    expect(trilemmaHue(0, 4)).toBe(210);
    expect(trilemmaHue(1, 4)).toBe(300);
  });
});

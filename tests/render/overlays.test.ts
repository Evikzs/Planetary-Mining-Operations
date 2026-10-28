import { describe, expect, it } from 'vitest';
import { greatCircleArc, sectionFill } from '../../src/render/overlays/geometry';
import { DEFAULT_FILTER, filterTint } from '../../src/render/overlays/filters';
import {
  angleBetween,
  len,
  normalize,
  sub,
  tangentBasis,
  add,
  scale,
  type Vec3,
} from '../../src/shared/vec3';
import { palette } from '../../src/ui/tokens';

describe('overlay geometry', () => {
  it('arc endpoints match and points are unit length', () => {
    const a = normalize([1, 0.2, 0]);
    const b = normalize([0.3, 1, -0.4]);
    const arc = greatCircleArc(a, b, 16);
    expect(arc).toHaveLength(17);
    expect(len(sub(arc[0]!, a))).toBeLessThan(1e-12);
    expect(len(sub(arc[16]!, b))).toBeLessThan(1e-12);
    const step = angleBetween(a, b) / 16;
    arc.forEach((p, i) => {
      expect(Math.abs(len(p) - 1)).toBeLessThan(1e-12);
      if (i > 0) expect(angleBetween(arc[i - 1]!, p)).toBeCloseTo(step, 9);
    });
  });

  it('fill vertices lie on the unit sphere; triangles = polygon.length × subdiv²', () => {
    const center = normalize([0.1, 0.9, 0.2]);
    const { east, north } = tangentBasis(center);
    const polygon: Vec3[] = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * 2 * Math.PI;
      return normalize(
        add(center, add(scale(east, 0.25 * Math.cos(a)), scale(north, 0.25 * Math.sin(a)))),
      );
    });
    const { positions, indices } = sectionFill(polygon, center, 4);
    expect(indices.length / 3).toBe(6 * 16);
    const n = positions.length / 3;
    for (let i = 0; i < n; i++) {
      const p: Vec3 = [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
      expect(Math.abs(len(p) - 1)).toBeLessThan(1e-6);
    }
    expect(Math.max(...indices)).toBeLessThan(n);
  });
});

describe('map filters', () => {
  it('defaults to ownership from orbit and nothing up close', () => {
    expect(DEFAULT_FILTER).toEqual({ planetary: 'ownership', local: 'none' });
  });

  it('tints teal when fine, mustard when strained, rust when failing', () => {
    // Power: full supply is fine, half or more is strained.
    expect(filterTint(1, 1, 0.5)).toBe(palette.teal);
    expect(filterTint(0.75, 1, 0.5)).toBe(palette.mustard);
    expect(filterTint(0.5, 1, 0.5)).toBe(palette.mustard);
    expect(filterTint(0.49, 1, 0.5)).toBe(palette.rust);
    // Morale: migrants come at 50, strikes start below 25.
    expect(filterTint(0.9, 0.5, 0.25)).toBe(palette.teal);
    expect(filterTint(0.3, 0.5, 0.25)).toBe(palette.mustard);
    expect(filterTint(0.2, 0.5, 0.25)).toBe(palette.rust);
  });
});

import { describe, expect, it } from 'vitest';
import { ribbonGeometry } from '../../src/render/world/ribbon';
import { cross, dot, len, normalize, scale, sub, type Vec3 } from '../../src/shared/vec3';

// A gentle arc over a 100-unit sphere.
const dirs: Vec3[] = Array.from({ length: 9 }, (_, i) => normalize([i * 0.02, 1, 0.01 * i * i]));
const points = dirs.map((d) => scale(d, 100.5));

describe('ribbon', () => {
  it('ribbon has 2 vertices per point and (n−1)×6 indices', () => {
    const r = ribbonGeometry(points, dirs, 0.18);
    expect(r.positions).toHaveLength(points.length * 2 * 3);
    expect(r.normals).toHaveLength(points.length * 2 * 3);
    expect(r.indices).toHaveLength((points.length - 1) * 6);
    expect(Math.max(...r.indices)).toBe(points.length * 2 - 1);
  });

  it('ribbon vertices sit width/2 from the centreline', () => {
    const w = 0.18;
    const r = ribbonGeometry(points, dirs, w);
    const at = (i: number): Vec3 => [
      r.positions[i * 3]!,
      r.positions[i * 3 + 1]!,
      r.positions[i * 3 + 2]!,
    ];
    points.forEach((p, i) => {
      const [left, right] = [at(i * 2), at(i * 2 + 1)];
      expect(len(sub(left, p))).toBeCloseTo(w / 2, 5);
      expect(len(sub(right, p))).toBeCloseTo(w / 2, 5);
      // Opposite sides of the centre, across the path.
      expect(dot(sub(left, p), sub(right, p))).toBeLessThan(0);
    });
  });

  it('faces up: every triangle normal points along the surface normal', () => {
    const r = ribbonGeometry(points, dirs, 0.18);
    const at = (i: number): Vec3 => [
      r.positions[i * 3]!,
      r.positions[i * 3 + 1]!,
      r.positions[i * 3 + 2]!,
    ];
    for (let t = 0; t < r.indices.length; t += 3) {
      const [a, b, c] = [at(r.indices[t]!), at(r.indices[t + 1]!), at(r.indices[t + 2]!)];
      expect(dot(cross(sub(b, a), sub(c, a)), normalize(a))).toBeGreaterThan(0);
    }
  });
});

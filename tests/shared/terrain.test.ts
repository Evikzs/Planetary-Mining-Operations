import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/rng';
import { createTerrain, HEIGHT_MAX, HEIGHT_MIN } from '../../src/shared/terrain';
import { normalize, tangentBasis, type Vec3, add, scale } from '../../src/shared/vec3';

function randomDirs(n: number, seed = 3): Vec3[] {
  const r = createRng(seed);
  const out: Vec3[] = [];
  while (out.length < n) {
    const p: Vec3 = [r.next() * 2 - 1, r.next() * 2 - 1, r.next() * 2 - 1];
    const l = Math.hypot(...p);
    if (l > 0.1 && l <= 1) out.push(normalize(p));
  }
  return out;
}

describe('lunar terrain', () => {
  const terrain = createTerrain(7);

  it('is deterministic across instances', () => {
    const other = createTerrain(7);
    for (const d of randomDirs(100)) expect(other.height(d)).toBe(terrain.height(d));
  });

  it('differs between seeds', () => {
    const other = createTerrain(8);
    const dirs = randomDirs(50);
    expect(dirs.some((d) => other.height(d) !== terrain.height(d))).toBe(true);
  });

  it('is continuous', () => {
    for (const d of randomDirs(1000)) {
      const { east } = tangentBasis(d);
      const moved = normalize(add(d, scale(east, 1e-4)));
      expect(Math.abs(terrain.height(d) - terrain.height(moved))).toBeLessThan(0.05);
    }
  });

  it('stays in range and never NaN', () => {
    for (const d of randomDirs(20000, 11)) {
      const h = terrain.height(d);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(HEIGHT_MIN);
      expect(h).toBeLessThanOrEqual(HEIGHT_MAX);
    }
  });

  it('is safe at the poles', () => {
    for (const pole of [
      [0, 1, 0],
      [0, -1, 0],
    ] as Vec3[]) {
      expect(Number.isFinite(terrain.height(pole))).toBe(true);
      expect(Number.isFinite(terrain.slopeAt(pole))).toBe(true);
    }
  });

  it('has maria on 15–45% of the surface', () => {
    const dirs = randomDirs(5000, 5);
    const share = dirs.filter((d) => terrain.mariaMask(d) > 0.5).length / dirs.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.45);
  });

  it('has craters: some samples are crater floors and some are rims', () => {
    const classes = randomDirs(20000, 9).map((d) => terrain.surfaceClass(d));
    expect(classes.filter((c) => c === 2).length).toBeGreaterThan(0);
    expect(classes.filter((c) => c === 3).length).toBeGreaterThan(0);
  });

  it('samples 10,000 heights in < 60 ms', () => {
    const dirs = randomDirs(10000, 13);
    for (const d of dirs.slice(0, 500)) terrain.height(d);
    const t0 = performance.now();
    for (const d of dirs) terrain.height(d);
    expect(performance.now() - t0).toBeLessThan(60);
  });
});

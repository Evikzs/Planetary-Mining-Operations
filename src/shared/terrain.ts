import { createRng, deriveSeed } from '../sim/rng';
import { createNoise, fbm } from './noise';
import { LUNA_RADIUS } from './scale';
import {
  add,
  dot,
  fibonacciSphere,
  latLon,
  normalize,
  scale,
  tangentBasis,
  type Vec3,
} from './vec3';

export type SurfaceClass = 0 | 1 | 2 | 3 | 4; // highland, maria, crater floor, rim, polar frost
export const HEIGHT_MIN = -1.2;
export const HEIGHT_MAX = 1.6;

export interface Terrain {
  height(dir: Vec3): number;
  mariaMask(dir: Vec3): number;
  surfaceClass(dir: Vec3): SurfaceClass;
  slopeAt(dir: Vec3, step?: number): number;
}

interface Crater {
  center: Vec3;
  radius: number; // world units
  depth: number;
  cosReach: number; // cos of the largest angle the crater affects
}

const CRATER_COUNT = 420;
const CELL = 0.22; // unit-sphere grid cell; twice the largest crater reach
const GRID = Math.ceil(2 / CELL) + 1;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const cellIndex = (v: number) => Math.min(GRID - 1, Math.max(0, Math.floor((v + 1) / CELL)));

export function createTerrain(seed: number, radius = LUNA_RADIUS): Terrain {
  const base = createNoise(seed, 'base');
  const maria = createNoise(seed, 'maria');
  const rng = createRng(deriveSeed(seed, 'craters'));
  const spacing = Math.sqrt((4 * Math.PI) / CRATER_COUNT);

  const grid = new Map<number, Crater[]>();
  for (const p of fibonacciSphere(CRATER_COUNT)) {
    const { east, north } = tangentBasis(p);
    const jx = (rng.next() * 2 - 1) * 0.35 * spacing;
    const jy = (rng.next() * 2 - 1) * 0.35 * spacing;
    const center = normalize(add(p, add(scale(east, jx), scale(north, jy))));
    const r = 0.6 + 5.4 * rng.next() ** 3;
    const crater = {
      center,
      radius: r,
      depth: 0.22 * r ** 0.55,
      cosReach: Math.cos((1.8 * r) / radius),
    };
    const key = (cellIndex(center[0]) * GRID + cellIndex(center[1])) * GRID + cellIndex(center[2]);
    grid.set(key, [...(grid.get(key) ?? []), crater]);
  }

  function sample(dir: Vec3): { h: number; m: number; x: number } {
    let h = 0.55 * fbm(base, scale(dir, 1.6), 5);
    const m = smoothstep(0.05, 0.25, fbm(maria, scale(dir, 0.9), 3));
    h -= 0.35 * m;
    let nearest = Infinity;
    const cx = cellIndex(dir[0]);
    const cy = cellIndex(dir[1]);
    const cz = cellIndex(dir[2]);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        for (let k = cz - 1; k <= cz + 1; k++) {
          const list = grid.get((i * GRID + j) * GRID + k);
          if (!list) continue;
          for (const c of list) {
            const cos = dot(dir, c.center);
            if (cos < c.cosReach) continue;
            const x = (Math.acos(Math.min(1, cos)) * radius) / c.radius;
            nearest = Math.min(nearest, x);
            if (x < 1) h += c.depth * (x * x - 1);
            if (x > 0.6 && x < 1.8) h += 0.35 * c.depth * Math.exp(-(((x - 1) / 0.22) ** 2));
          }
        }
      }
    }
    return { h: Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, h)), m, x: nearest };
  }

  const height = (dir: Vec3) => sample(dir).h;

  return {
    height,
    mariaMask: (dir) => smoothstep(0.05, 0.25, fbm(maria, scale(dir, 0.9), 3)),
    surfaceClass(dir) {
      const { h, m, x } = sample(dir);
      if (Math.abs(latLon(dir).lat) > (80 * Math.PI) / 180 && h < 0) return 4;
      if (x < 0.7) return 2;
      if (x > 0.85 && x < 1.25) return 3;
      return m > 0.5 ? 1 : 0;
    },
    slopeAt(dir, step = 0.05) {
      const { east, north } = tangentBasis(dir);
      const h0 = height(dir);
      let max = 0;
      for (const v of [east, north, scale(east, -1), scale(north, -1)]) {
        const d = normalize(add(dir, scale(v, step / radius)));
        max = Math.max(max, Math.abs(height(d) - h0) / step);
      }
      return max;
    },
  };
}

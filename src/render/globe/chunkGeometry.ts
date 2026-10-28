import type { SurfaceClass, Terrain } from '../../shared/terrain';
import { add, cross, normalize, scale, sub, tangentBasis, type Vec3 } from '../../shared/vec3';
import { cubeToSphere } from './cubeSphere';
import { keyOf, nodeSize, nodeSpan, type ChunkKey } from './quadtree';

export const CHUNK_RES = 32;
const SIDE = CHUNK_RES + 1;
const GRID_VERTS = SIDE * SIDE;
const VERTS = GRID_VERTS + 4 * SIDE;
// Normals come from terrain samples this far either side, so both chunks at a seam agree.
const NORMAL_STEP = 0.02;

export interface ChunkMeshData {
  key: string;
  center: Vec3;
  /** Relative to center. */
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
}

/** Grid index of skirt vertex s: the four edges in turn, counter-clockwise seen from outside. */
function edgeVertex(s: number): number {
  const k = s % SIDE;
  switch (Math.floor(s / SIDE)) {
    case 0:
      return k;
    case 1:
      return k * SIDE + CHUNK_RES;
    case 2:
      return CHUNK_RES * SIDE + CHUNK_RES - k;
    default:
      return (CHUNK_RES - k) * SIDE;
  }
}

const INDICES = (() => {
  const out: number[] = [];
  for (let j = 0; j < CHUNK_RES; j++) {
    for (let i = 0; i < CHUNK_RES; i++) {
      const a = j * SIDE + i;
      out.push(a, a + 1, a + SIDE, a + 1, a + SIDE + 1, a + SIDE);
    }
  }
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < CHUNK_RES; k++) {
      const s = e * SIDE + k;
      const [a, b] = [edgeVertex(s), edgeVertex(s + 1)];
      const [a2, b2] = [GRID_VERTS + s, GRID_VERTS + s + 1];
      out.push(a, a2, b, b, a2, b2);
    }
  }
  return Uint16Array.from(out);
})();

function surfaceNormal(terrain: Terrain, dir: Vec3, radius: number): Vec3 {
  const { east, north } = tangentBasis(dir);
  const at = (axis: Vec3, sign: number): Vec3 => {
    const d = normalize(add(dir, scale(axis, (sign * NORMAL_STEP) / radius)));
    return scale(d, radius + terrain.height(d));
  };
  return normalize(cross(sub(at(east, 1), at(east, -1)), sub(at(north, 1), at(north, -1))));
}

/**
 * The class colour; between highland and maria it blends on the maria mask,
 * so the shoreline does not follow the grid cells in steps.
 */
function surfaceColor(
  terrain: Terrain,
  dir: Vec3,
  colors: Record<SurfaceClass, readonly [number, number, number]>,
): readonly [number, number, number] {
  const cls = terrain.surfaceClass(dir);
  if (cls > 1) return colors[cls];
  const x = Math.min(1, Math.max(0, (terrain.mariaMask(dir) - 0.25) / 0.5));
  const t = x * x * (3 - 2 * x);
  const [a, b] = [colors[0], colors[1]];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A 33 × 33 terrain grid plus a skirt ring that hides cracks between detail levels. */
export function buildChunk(
  key: ChunkKey,
  radius: number,
  terrain: Terrain,
  colors: Record<SurfaceClass, readonly [number, number, number]>,
): ChunkMeshData {
  const { u0, u1, v0, v1 } = nodeSpan(key);
  const center = scale(cubeToSphere(key.face, (u0 + u1) / 2, (v0 + v1) / 2), radius);
  const positions = new Float32Array(VERTS * 3);
  const normals = new Float32Array(VERTS * 3);
  const rgb = new Float32Array(VERTS * 3);
  const dirs: Vec3[] = [];
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      const at = (j * SIDE + i) * 3;
      const u = u0 + ((u1 - u0) * i) / CHUNK_RES;
      const v = v0 + ((v1 - v0) * j) / CHUNK_RES;
      const dir = cubeToSphere(key.face, u, v);
      const p = scale(dir, radius + terrain.height(dir));
      dirs.push(dir);
      positions.set(sub(p, center), at);
      normals.set(surfaceNormal(terrain, dir, radius), at);
      rgb.set(surfaceColor(terrain, dir, colors), at);
    }
  }
  const depth = Math.max(0.05, 0.5 * nodeSize(key.level, radius));
  for (let s = 0; s < 4 * SIDE; s++) {
    const g = edgeVertex(s);
    const dir = dirs[g]!;
    const at = (GRID_VERTS + s) * 3;
    for (let c = 0; c < 3; c++) {
      positions[at + c] = positions[g * 3 + c]! - dir[c]! * depth;
      normals[at + c] = normals[g * 3 + c]!;
      rgb[at + c] = rgb[g * 3 + c]!;
    }
  }
  // A fresh copy: the worker transfers each chunk's buffers away.
  return { key: keyOf(key), center, positions, normals, colors: rgb, indices: INDICES.slice() };
}

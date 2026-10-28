import { describe, expect, it } from 'vitest';
import { buildChunk, CHUNK_RES, type ChunkMeshData } from '../../src/render/globe/chunkGeometry';
import { cubeToSphere, type Face } from '../../src/render/globe/cubeSphere';
import {
  keyOf,
  LOD,
  nodeBounds,
  selectChunks,
  type ChunkKey,
} from '../../src/render/globe/quadtree';
import { createTerrain, type SurfaceClass } from '../../src/shared/terrain';
import { dot, len, normalize, scale, sub, type Vec3 } from '../../src/shared/vec3';

const R = 100;
const COLORS: Record<SurfaceClass, [number, number, number]> = {
  0: [1, 0, 0],
  1: [0, 1, 0],
  2: [0, 0, 1],
  3: [1, 1, 0],
  4: [0, 1, 1],
};

function vertex(c: ChunkMeshData, i: number): Vec3 {
  return [
    c.center[0] + c.positions[i * 3]!,
    c.center[1] + c.positions[i * 3 + 1]!,
    c.center[2] + c.positions[i * 3 + 2]!,
  ];
}
const normalAt = (c: ChunkMeshData, i: number): Vec3 => [
  c.normals[i * 3]!,
  c.normals[i * 3 + 1]!,
  c.normals[i * 3 + 2]!,
];

function isAncestor(a: ChunkKey, b: ChunkKey): boolean {
  if (a.face !== b.face || a.level >= b.level) return false;
  const shift = b.level - a.level;
  return b.x >> shift === a.x && b.y >> shift === a.y;
}

describe('cube sphere', () => {
  it('cubeToSphere is unit length and continuous across face edges (1e-9)', () => {
    const ts = [-1, -0.5, 0, 0.5, 1];
    const edge: { face: number; p: Vec3 }[] = [];
    for (let f = 0; f < 6; f++) {
      for (const u of ts) {
        for (const v of ts)
          expect(Math.abs(len(cubeToSphere(f as Face, u, v)) - 1)).toBeLessThan(1e-9);
      }
      for (const t of ts) {
        for (const [u, v] of [
          [-1, t],
          [1, t],
          [t, -1],
          [t, 1],
        ] as const) {
          edge.push({ face: f, p: cubeToSphere(f as Face, u, v) });
        }
      }
    }
    for (const a of edge) {
      expect(edge.some((b) => b.face !== a.face && len(sub(a.p, b.p)) < 1e-9)).toBe(true);
    }
  });
});

describe('quadtree', () => {
  it('altitude 400: no leaf deeper than level 2 and no back-face leaves', () => {
    const cam = scale(normalize([0.2, -0.5, 1]), R + 400);
    const leaves = selectChunks(cam, R);
    expect(leaves.length).toBeGreaterThan(0);
    expect(Math.max(...leaves.map((k) => k.level))).toBeLessThanOrEqual(2);
    // Nothing on the far side: every leaf is centred within 135° of the camera.
    const camDir = normalize(cam);
    for (const k of leaves) {
      expect(dot(nodeBounds(k).center, camDir)).toBeGreaterThan(Math.cos((135 * Math.PI) / 180));
    }
  });

  it('bird’s-eye altitude 1.5: the leaf under the camera is level 8; ≤ 220 leaves without frustum', () => {
    const dir = normalize([0.3, -0.8, 0.5]);
    const leaves = selectChunks(scale(dir, R + 1.5), R);
    expect(leaves.length).toBeLessThanOrEqual(220);
    const under = leaves.reduce((best, k) =>
      dot(nodeBounds(k).center, dir) > dot(nodeBounds(best).center, dir) ? k : best,
    );
    expect(under.level).toBe(LOD.maxLevel);
  });

  it('no emitted key is an ancestor of another', () => {
    for (const [dir, alt] of [
      [normalize([0.3, -0.8, 0.5]), 1.5],
      [normalize([1, 1, 1]), 5],
      [normalize([0, -1, 0.01]), 20],
      [normalize([-0.4, 0.2, -1]), 120],
    ] as const) {
      const leaves = selectChunks(scale(dir, R + alt), R);
      const keys = new Set(leaves.map(keyOf));
      expect(keys.size).toBe(leaves.length);
      for (const a of leaves) for (const b of leaves) expect(isAncestor(a, b)).toBe(false);
    }
  });
});

describe('chunk geometry', () => {
  const terrain = createTerrain(42);

  it('chunk has 1221 vertices and 6912 indices', () => {
    const c = buildChunk({ face: 3, level: 5, x: 11, y: 20 }, R, terrain, COLORS);
    expect(CHUNK_RES).toBe(32);
    expect(c.key).toBe('3/5/11/20');
    expect(c.positions).toHaveLength(1221 * 3);
    expect(c.normals).toHaveLength(1221 * 3);
    expect(c.colors).toHaveLength(1221 * 3);
    expect(c.indices).toHaveLength(6912);
    expect(Math.max(...c.indices)).toBe(1220);
    // Grid vertices sit on the terrain; positions are relative to the centre.
    const p = vertex(c, 500);
    expect(Math.abs(len(p) - (R + terrain.height(normalize(p))))).toBeLessThan(1e-4);
  });

  it('shared edge vertices of neighbouring chunks on different faces coincide (1e-4)', () => {
    // +Z's right edge (u = 1) is +X's left edge (u = -1) at the same v.
    const a = buildChunk({ face: 4, level: 1, x: 1, y: 0 }, R, terrain, COLORS);
    const b = buildChunk({ face: 0, level: 1, x: 0, y: 0 }, R, terrain, COLORS);
    const side = CHUNK_RES + 1;
    for (let j = 0; j < side; j++) {
      const ia = j * side + CHUNK_RES;
      const ib = j * side;
      expect(len(sub(vertex(a, ia), vertex(b, ib)))).toBeLessThan(1e-4);
      expect(len(sub(normalAt(a, ia), normalAt(b, ib)))).toBeLessThan(1e-4);
    }
  });
});

import { HEIGHT_MAX, HEIGHT_MIN } from '../../shared/terrain';
import { dot, len, scale, sub, type Vec3 } from '../../shared/vec3';
import { cubeToSphere, type Face } from './cubeSphere';

export interface ChunkKey {
  face: Face;
  level: number;
  x: number;
  y: number;
}

export const keyOf = (k: ChunkKey): string => `${k.face}/${k.level}/${k.x}/${k.y}`;

export const LOD = { maxLevel: 8, splitFactor: 2.2 } as const;

/** A node's u or v span on its face. */
export function nodeSpan(k: ChunkKey): { u0: number; u1: number; v0: number; v1: number } {
  const step = 2 / 2 ** k.level;
  return {
    u0: -1 + k.x * step,
    u1: -1 + (k.x + 1) * step,
    v0: -1 + k.y * step,
    v1: -1 + (k.y + 1) * step,
  };
}

/** The node's centre direction and the widest angle from it to a corner. */
export function nodeBounds(k: ChunkKey): { center: Vec3; angle: number } {
  const { u0, u1, v0, v1 } = nodeSpan(k);
  const center = cubeToSphere(k.face, (u0 + u1) / 2, (v0 + v1) / 2);
  let angle = 0;
  for (const [u, v] of [
    [u0, v0],
    [u1, v0],
    [u0, v1],
    [u1, v1],
  ] as const) {
    angle = Math.max(angle, Math.acos(Math.min(1, dot(center, cubeToSphere(k.face, u, v)))));
  }
  return { center, angle };
}

/** Edge length of a node in world units. */
export const nodeSize = (level: number, radius: number): number =>
  ((Math.PI / 2) * radius) / 2 ** level;

export function children(k: ChunkKey): ChunkKey[] {
  const level = k.level + 1;
  const [x, y] = [k.x * 2, k.y * 2];
  return [
    { face: k.face, level, x, y },
    { face: k.face, level, x: x + 1, y },
    { face: k.face, level, x, y: y + 1 },
    { face: k.face, level, x: x + 1, y: y + 1 },
  ];
}

export const ROOTS: ChunkKey[] = ([0, 1, 2, 3, 4, 5] as const).map((face) => ({
  face,
  level: 0,
  x: 0,
  y: 0,
}));

/**
 * The leaves to draw: nodes split while the camera is nearer than splitFactor × their size,
 * and nodes past the horizon or outside `visible` are left out.
 */
export function selectChunks(
  camPos: Vec3,
  radius: number,
  visible?: (center: Vec3, r: number) => boolean,
): ChunkKey[] {
  const out: ChunkKey[] = [];
  const camDist = len(camPos);
  const camDir = scale(camPos, 1 / camDist);
  const horizon = Math.acos(Math.min(1, radius / camDist));
  const visit = (k: ChunkKey): void => {
    const { center, angle } = nodeBounds(k);
    if (dot(center, camDir) < Math.cos(Math.min(Math.PI, horizon + angle))) return;
    const c = scale(center, radius);
    if (visible && !visible(c, boundingRadius(angle, radius))) return;
    const split =
      k.level < LOD.maxLevel && len(sub(camPos, c)) < LOD.splitFactor * nodeSize(k.level, radius);
    if (split) children(k).forEach(visit);
    else out.push(k);
  };
  ROOTS.forEach(visit);
  return out;
}

const TERRAIN_REACH = Math.max(HEIGHT_MAX, -HEIGHT_MIN);

/** Radius of a sphere around the node's centre that holds all of its terrain. */
export const boundingRadius = (angle: number, radius: number): number =>
  2 * radius * Math.sin(angle / 2) + TERRAIN_REACH;

import type { Vec3 } from '../../shared/vec3';

export type Face = 0 | 1 | 2 | 3 | 4 | 5; // +X −X +Y −Y +Z −Z

// Per face: outward normal n, then the u and v axes, with u × v = n so triangles wind outward.
const FACES: readonly (readonly [Vec3, Vec3, Vec3])[] = [
  [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [-1, 0, 0],
    [0, 1, 0],
  ],
];

/** Spherified cube: u, v in [−1, 1] on a face to a unit direction, with near-even cell sizes. */
export function cubeToSphere(face: Face, u: number, v: number): Vec3 {
  const [n, a, b] = FACES[face]!;
  const x = n[0] + u * a[0] + v * b[0];
  const y = n[1] + u * a[1] + v * b[1];
  const z = n[2] + u * a[2] + v * b[2];
  const x2 = x * x;
  const y2 = y * y;
  const z2 = z * z;
  return [
    x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3),
    y * Math.sqrt(1 - z2 / 2 - x2 / 2 + (z2 * x2) / 3),
    z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3),
  ];
}

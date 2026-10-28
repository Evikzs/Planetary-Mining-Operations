import { cross, normalize, scale, sub, add, type Vec3 } from '../../shared/vec3';

/**
 * A flat strip along a path: two vertices per point, width/2 either side of it,
 * across the path and the surface normal; triangles face along the normal.
 */
export function ribbonGeometry(
  points: Vec3[],
  normals: Vec3[],
  width: number,
): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const n = points.length;
  const positions = new Float32Array(n * 6);
  const outNormals = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const tangent = sub(points[Math.min(n - 1, i + 1)]!, points[Math.max(0, i - 1)]!);
    const side = scale(normalize(cross(tangent, normals[i]!)), width / 2);
    positions.set([...add(p, side), ...sub(p, side)], i * 6);
    outNormals.set([...normals[i]!, ...normals[i]!], i * 6);
  }
  const indices = new Uint32Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) {
    const [l, r] = [i * 2, i * 2 + 1];
    indices.set([l, l + 2, r, r, l + 2, r + 2], i * 6);
  }
  return { positions, normals: outNormals, indices };
}

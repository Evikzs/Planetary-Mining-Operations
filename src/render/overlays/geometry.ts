import { add, angleBetween, normalize, scale, sub, type Vec3 } from '../../shared/vec3';

/** segments + 1 evenly spaced unit directions from a to b along the great circle. */
export function greatCircleArc(a: Vec3, b: Vec3, segments: number): Vec3[] {
  const angle = angleBetween(a, b);
  const s = Math.sin(angle);
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    if (s < 1e-12) return normalize(add(scale(a, 1 - t), scale(b, t)));
    return normalize(
      add(scale(a, Math.sin((1 - t) * angle) / s), scale(b, Math.sin(t * angle) / s)),
    );
  });
}

/**
 * A section's area as a fan of triangles from its centre, each cut into subdiv² pieces
 * and pushed onto the unit sphere so the fill follows the curve.
 */
export function sectionFill(
  polygon: Vec3[],
  center: Vec3,
  subdiv: number,
): { positions: Float32Array; indices: Uint32Array } {
  const n = subdiv;
  const perFan = ((n + 1) * (n + 2)) / 2;
  const positions = new Float32Array(polygon.length * perFan * 3);
  const indices: number[] = [];
  const rowStart = (j: number): number => j * (n + 1) - (j * (j - 1)) / 2;
  polygon.forEach((v, k) => {
    const w = polygon[(k + 1) % polygon.length]!;
    const base = k * perFan;
    const [ab, ac] = [sub(v, center), sub(w, center)];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n - j; i++) {
        const p = normalize(add(center, add(scale(ab, i / n), scale(ac, j / n))));
        positions.set(p, (base + rowStart(j) + i) * 3);
      }
    }
    const at = (i: number, j: number): number => base + rowStart(j) + i;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n - j; i++) {
        indices.push(at(i, j), at(i + 1, j), at(i, j + 1));
        if (i < n - 1 - j) indices.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      }
    }
  });
  return { positions, indices: Uint32Array.from(indices) };
}

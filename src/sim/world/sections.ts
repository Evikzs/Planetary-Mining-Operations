import { createRng, deriveSeed } from '../rng';
import {
  add,
  cross,
  dot,
  fibonacciSphere,
  normalize,
  scale,
  sub,
  tangentBasis,
  type Vec3,
} from '../../shared/vec3';
import type { Section } from './types';

/** Index of the section whose centre is closest to dir (spherical Voronoi lookup). */
export function sectionAt(sections: readonly { center: Vec3 }[], dir: Vec3): number {
  let best = 0;
  let bestDot = -Infinity;
  sections.forEach((s, i) => {
    const d = dot(dir, s.center);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  });
  return best;
}

export function generateSections(seed: number, count: number): Omit<Section, 'hubPlotId'>[] {
  const rng = createRng(deriveSeed(seed, 'sections'));
  const spacing = Math.sqrt((4 * Math.PI) / count);
  const centers = fibonacciSphere(count).map((p) => {
    const { east, north } = tangentBasis(p);
    const jx = (rng.next() * 2 - 1) * 0.35 * spacing;
    const jy = (rng.next() * 2 - 1) * 0.35 * spacing;
    return normalize(add(p, add(scale(east, jx), scale(north, jy))));
  });

  // Delaunay on the sphere = faces of the convex hull; brute force is fine for ~60 points.
  const faces: { ids: [number, number, number]; circumcenter: Vec3 }[] = [];
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      for (let k = j + 1; k < count; k++) {
        const a = centers[i]!;
        let n = cross(sub(centers[j]!, a), sub(centers[k]!, a));
        if (dot(n, a) < 0) n = scale(n, -1);
        let hull = true;
        for (let m = 0; m < count && hull; m++) {
          if (m !== i && m !== j && m !== k && dot(n, sub(centers[m]!, a)) > 0) hull = false;
        }
        if (hull) faces.push({ ids: [i, j, k], circumcenter: normalize(n) });
      }
    }
  }

  return centers.map((center, id) => {
    const mine = faces.filter((f) => f.ids.includes(id));
    const neighbors = [...new Set(mine.flatMap((f) => f.ids).filter((n) => n !== id))].sort(
      (x, y) => x - y,
    );
    const { east, north } = tangentBasis(center);
    const polygon = mine
      .map((f) => f.circumcenter)
      .sort((p, q) => {
        const ap = Math.atan2(dot(p, north), dot(p, east));
        const aq = Math.atan2(dot(q, north), dot(q, east));
        return ap - aq;
      });
    return { id, center, neighbors, polygon };
  });
}

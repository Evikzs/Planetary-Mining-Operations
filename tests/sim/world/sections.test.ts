import { describe, expect, it } from 'vitest';
import { generateSections, sectionAt } from '../../../src/sim/world/sections';
import { dot } from '../../../src/shared/vec3';

describe('sections', () => {
  const sections = generateSections(42, 60);

  it('builds 60 sections with 116 Delaunay triangles', () => {
    expect(sections).toHaveLength(60);
    const edges = sections.reduce((n, s) => n + s.neighbors.length, 0) / 2;
    // Euler for a triangulated sphere: E = 3N − 6, F = 2N − 4.
    expect(edges).toBe(3 * 60 - 6);
    const vertices = new Set(sections.flatMap((s) => s.polygon.map((v) => v.join(','))));
    expect(vertices.size).toBe(2 * 60 - 4);
  });

  it('neighbors are symmetric and at least 3', () => {
    for (const s of sections) {
      expect(s.neighbors.length).toBeGreaterThanOrEqual(3);
      for (const n of s.neighbors) expect(sections[n]?.neighbors).toContain(s.id);
    }
  });

  it('sectionAt(center_i) === i', () => {
    for (const s of sections) expect(sectionAt(sections, s.center)).toBe(s.id);
  });

  it('polygon vertices are equidistant to the centre and two neighbours (1e-9)', () => {
    for (const s of sections) {
      for (const v of s.polygon) {
        const d0 = dot(v, s.center);
        const close = s.neighbors.filter((n) => Math.abs(dot(v, sections[n]!.center) - d0) < 1e-9);
        expect(close.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('is deterministic and seed-sensitive', () => {
    expect(generateSections(42, 60)).toEqual(sections);
    expect(generateSections(43, 60)).not.toEqual(sections);
  });
});

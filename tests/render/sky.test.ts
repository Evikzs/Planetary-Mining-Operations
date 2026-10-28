import { describe, expect, it } from 'vitest';
import { STAR_COUNT, STAR_RADIUS, starPositions } from '../../src/render/sky';

describe('sky', () => {
  it('stars are 600 seeded points on the radius-3000 sphere', () => {
    const stars = starPositions(42);
    expect(STAR_COUNT).toBe(600);
    expect(STAR_RADIUS).toBe(3000);
    expect(stars).toHaveLength(1800);
    for (let i = 0; i < stars.length; i += 3) {
      const r = Math.hypot(stars[i]!, stars[i + 1]!, stars[i + 2]!);
      expect(Math.abs(r - 3000)).toBeLessThan(0.01);
    }
    expect(starPositions(42)).toEqual(stars);
    expect(starPositions(43)).not.toEqual(stars);
  });
});

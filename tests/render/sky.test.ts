import { describe, expect, it } from 'vitest';
import { STAR_COUNT, starPositions } from '../../src/render/sky';

describe('sky', () => {
  it('stars are 6500 seeded unit directions', () => {
    const stars = starPositions(42);
    expect(STAR_COUNT).toBe(6500);
    expect(stars).toHaveLength(STAR_COUNT * 3);
    for (let i = 0; i < stars.length; i += 3) {
      const r = Math.hypot(stars[i]!, stars[i + 1]!, stars[i + 2]!);
      expect(Math.abs(r - 1)).toBeLessThan(1e-5);
    }
    expect(starPositions(42)).toEqual(stars);
    expect(starPositions(43)).not.toEqual(stars);
  });
});

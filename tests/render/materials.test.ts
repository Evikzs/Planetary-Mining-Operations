import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { TERRAIN_COLORS } from '../../src/render/materials';

const lum = (hex: string): number => {
  const c = new Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

describe('materials', () => {
  it('the maria are the darkest ground; rims stand out from crater floors', () => {
    const l = Object.values(TERRAIN_COLORS).map(lum);
    expect(Math.min(...l)).toBe(lum(TERRAIN_COLORS[1]));
    expect(lum(TERRAIN_COLORS[0])).toBeGreaterThan(lum(TERRAIN_COLORS[1]));
    expect(lum(TERRAIN_COLORS[3])).toBeGreaterThan(lum(TERRAIN_COLORS[2]));
  });

  it('polar frost reads colder than the highlands', () => {
    const blueness = (hex: string) => new Color(hex).b - new Color(hex).r;
    expect(blueness(TERRAIN_COLORS[4])).toBeGreaterThan(blueness(TERRAIN_COLORS[0]));
  });
});

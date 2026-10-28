import { NearestFilter } from 'three';
import { describe, expect, it } from 'vitest';
import { bandsTexture, TERRAIN_COLORS } from '../../src/render/materials';
import { bodyAccent, mix, palette } from '../../src/ui/tokens';

describe('materials', () => {
  it('terrain colours are the pinned token mixes', () => {
    const { cream, navy, teal } = palette;
    const luna = bodyAccent.luna;
    expect(TERRAIN_COLORS).toEqual({
      0: mix(cream, luna, 0.45),
      1: mix(navy, luna, 0.35),
      2: mix(luna, navy, 0.25),
      3: mix(cream, luna, 0.15),
      4: mix(cream, teal, 0.2),
    });
  });

  it('bands texture has 3 nearest-filtered steps', () => {
    const tex = bandsTexture();
    expect(tex.image.width).toBe(3);
    expect(tex.image.height).toBe(1);
    expect(Array.from(tex.image.data as Uint8Array)).toEqual([107, 179, 255]);
    expect(tex.minFilter).toBe(NearestFilter);
    expect(tex.magFilter).toBe(NearestFilter);
    expect(tex.generateMipmaps).toBe(false);
  });
});

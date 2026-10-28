import { RepeatWrapping } from 'three';
import { describe, expect, it } from 'vitest';
import { paperTexture } from '../../src/render/post/paperTexture';

describe('paper texture', () => {
  it('paper texture is deterministic and light (200–255)', () => {
    const tex = paperTexture(42);
    const data = tex.image.data as Uint8Array;
    expect([tex.image.width, tex.image.height]).toEqual([256, 256]);
    expect(Array.from(data)).toEqual(Array.from(paperTexture(42).image.data as Uint8Array));
    expect(Array.from(data)).not.toEqual(Array.from(paperTexture(43).image.data as Uint8Array));
    expect(data.reduce((m, v) => Math.min(m, v), 255)).toBeGreaterThanOrEqual(200);
    expect(data.reduce((m, v) => Math.max(m, v), 0)).toBeLessThanOrEqual(255);
    // Grain, not a flat sheet.
    expect(new Set(data).size).toBeGreaterThan(20);
    expect([tex.wrapS, tex.wrapT]).toEqual([RepeatWrapping, RepeatWrapping]);
  });

  it('tiles without a seam: opposite edges match their wrapped neighbours', () => {
    const data = paperTexture(7).image.data as Uint8Array;
    const at = (x: number, y: number) => data[((y + 256) % 256) * 256 + ((x + 256) % 256)]!;
    let jumpAtSeam = 0;
    let jumpInside = 0;
    for (let y = 0; y < 256; y++) {
      jumpAtSeam += Math.abs(at(255, y) - at(0, y));
      jumpInside += Math.abs(at(127, y) - at(128, y));
    }
    // The seam is no rougher than any other column pair.
    expect(jumpAtSeam).toBeLessThan(jumpInside * 1.5);
  });
});

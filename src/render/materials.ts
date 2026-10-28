import { DataTexture, NearestFilter, RedFormat } from 'three';
import type { SurfaceClass } from '../shared/terrain';
import { bodyAccent, mix, palette } from '../ui/tokens';

const { cream, navy, teal } = palette;
const luna = bodyAccent.luna;

/** Flat poster colour per surface class, mixed from the palette tokens. */
export const TERRAIN_COLORS: Record<SurfaceClass, string> = {
  0: mix(cream, luna, 0.45), // highland
  1: mix(navy, luna, 0.35), // maria
  2: mix(luna, navy, 0.25), // crater floor
  3: mix(cream, luna, 0.15), // rim
  4: mix(cream, teal, 0.2), // polar frost
};

/** Toon gradient map: hard light bands with no blending between them. */
export function bandsTexture(steps: number[] = [0.42, 0.7, 1.0]): DataTexture {
  const data = Uint8Array.from(steps, (s) => Math.round(s * 255));
  const tex = new DataTexture(data, steps.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

import { DataTexture, LinearFilter, RedFormat, RepeatWrapping } from 'three';
import { createRng, deriveSeed } from '../../sim/rng';

const CELLS = 16;

/**
 * Seeded paper grain, 200–255: soft fibre blotches on a wrapping 16 × 16 lattice plus
 * fine speckle, so the tile repeats across the screen without a seam.
 */
export function paperTexture(seed: number, size = 256): DataTexture {
  const rng = createRng(deriveSeed(seed, 'paper'));
  const lattice = Array.from({ length: CELLS * CELLS }, () => rng.next());
  const node = (x: number, y: number): number =>
    lattice[((y + CELLS) % CELLS) * CELLS + ((x + CELLS) % CELLS)]!;
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [u, v] = [(x / size) * CELLS, (y / size) * CELLS];
      const [x0, y0] = [Math.floor(u), Math.floor(v)];
      const [fx, fy] = [smooth(u - x0), smooth(v - y0)];
      const top = node(x0, y0) + (node(x0 + 1, y0) - node(x0, y0)) * fx;
      const bottom = node(x0, y0 + 1) + (node(x0 + 1, y0 + 1) - node(x0, y0 + 1)) * fx;
      const fibre = top + (bottom - top) * fy;
      const grain = 0.65 * fibre + 0.35 * rng.next();
      data[y * size + x] = 200 + Math.round(55 * grain);
    }
  }
  const tex = new DataTexture(data, size, size, RedFormat);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

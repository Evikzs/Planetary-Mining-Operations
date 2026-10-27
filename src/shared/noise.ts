import { createNoise3D } from 'simplex-noise';
import { createRng, deriveSeed } from '../sim/rng';
import type { Vec3 } from './vec3';

export type Noise3 = (x: number, y: number, z: number) => number;

export function createNoise(seed: number, label: string): Noise3 {
  const rng = createRng(deriveSeed(seed, label));
  return createNoise3D(() => rng.next());
}

/** Fractal noise normalised to about [-1, 1]. */
export function fbm(n: Noise3, p: Vec3, octaves: number, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * n(p[0] * freq, p[1] * freq, p[2] * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

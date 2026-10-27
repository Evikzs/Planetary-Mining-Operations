import { cyrb53 } from './hash';

export type RngState = readonly [number, number, number, number];

export interface Rng {
  next(): number;
  int(minIncl: number, maxIncl: number): number;
  pick<T>(items: readonly T[]): T;
  normal(): number;
  getState(): RngState;
}

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** sfc32 (PractRand): small, fast and good enough for game randomness. */
class Sfc32 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  private raw(): number {
    let a = this.a >>> 0;
    let b = this.b >>> 0;
    let c = this.c >>> 0;
    let d = this.d >>> 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.a = a >>> 0;
    this.b = b >>> 0;
    this.c = c >>> 0;
    this.d = d >>> 0;
    return t >>> 0;
  }

  next(): number {
    return this.raw() / 4294967296;
  }

  int(minIncl: number, maxIncl: number): number {
    return minIncl + Math.floor(this.next() * (maxIncl - minIncl + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('cannot pick from an empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }
}

export function createRng(seed: number): Rng {
  const sm = splitmix32(seed >>> 0);
  const rng = new Sfc32([sm(), sm(), sm(), sm()]);
  for (let i = 0; i < 12; i++) rng.next();
  return rng;
}

export function rngFromState(state: RngState): Rng {
  return new Sfc32(state);
}

export function deriveSeed(seed: number, label: string): number {
  return (seed ^ (cyrb53(label) >>> 0)) >>> 0;
}

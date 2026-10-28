import { describe, expect, it } from 'vitest';
import { clipPlanes, createDprController, gameTimeAt } from '../../src/render/frame';

const feed = (c: ReturnType<typeof createDprController>, ms: number, frames: number) => {
  for (let i = 0; i < frames; i++) c.update(ms);
};

describe('frame', () => {
  it('clip planes follow the altitude', () => {
    expect(clipPlanes(1.5, 100)).toEqual({ near: 0.03, far: 301.5 });
    expect(clipPlanes(0.5, 100).near).toBe(0.02);
  });

  it('game time moves within one tick and stops at the next', () => {
    expect(gameTimeAt(100, 1000, 1, 1500)).toBe(100.5);
    expect(gameTimeAt(100, 1000, 60, 1010)).toBeCloseTo(100.6, 9);
    expect(gameTimeAt(100, 1000, 1, 5000)).toBe(101);
    expect(gameTimeAt(100, 1000, 1, 500)).toBe(100);
  });

  it('pixel ratio drops after 2 s of slow frames and recovers after 5 s of fast ones', () => {
    const c = createDprController(2);
    feed(c, 25, 100);
    expect(c.value).toBe(1.75);
    feed(c, 25, 2000);
    expect(c.value).toBe(1);
    feed(c, 8, 700);
    expect(c.value).toBe(1.25);
    feed(c, 8, 10_000);
    expect(c.value).toBe(2);
  });

  it('a single long hitch does not drop the pixel ratio', () => {
    const c = createDprController(2);
    feed(c, 16, 60);
    c.update(3000);
    feed(c, 16, 60);
    expect(c.value).toBe(2);
    expect(c.frameMsAvg).toBeLessThan(20);
  });
});

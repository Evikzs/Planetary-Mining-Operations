import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, rngFromState } from '../../src/sim/rng';

describe('rng', () => {
  it('pins the first values for seed 42', () => {
    const r = createRng(42);
    expect([r.next(), r.next(), r.next()].map((x) => x.toFixed(12))).toEqual([
      '0.563356057974',
      '0.288961866871',
      '0.005916276248',
    ]);
  });

  it('same seed gives the same 1000 values', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('next() stays in [0,1) and int(1,6) covers exactly 1..6', () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      seen.add(r.int(1, 6));
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('state round-trip continues identically', () => {
    const a = createRng(9);
    a.next();
    const b = rngFromState(a.getState());
    expect(b.next()).toBe(a.next());
  });

  it('derived streams differ', () => {
    expect(deriveSeed(42, 'terrain')).not.toBe(deriveSeed(42, 'people'));
  });

  it('pick returns an item and normal() is finite', () => {
    const r = createRng(3);
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    for (let i = 0; i < 100; i++) expect(Number.isFinite(r.normal())).toBe(true);
  });
});

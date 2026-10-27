import { describe, expect, it } from 'vitest';
import { canonicalStringify, cyrb53, hashState } from '../../src/sim/hash';

describe('hash', () => {
  it('pins cyrb53', () => {
    expect(cyrb53('pmo')).toBe(5460725301389868);
    expect(cyrb53('')).toBe(3338908027751811);
  });

  it('sorts keys and encodes Maps and typed arrays', () => {
    expect(canonicalStringify({ b: 1, a: [1, 2] })).toBe('{"a":[1,2],"b":1}');
    expect(
      canonicalStringify(
        new Map([
          ['z', 1],
          ['a', 2],
        ]),
      ),
    ).toBe('{"$map":[["a",2],["z",1]]}');
    expect(canonicalStringify(new Uint8Array([1, 2]))).toBe('{"$ta":"Uint8Array","v":[1,2]}');
  });

  it('throws on NaN and Infinity', () => {
    expect(() => canonicalStringify({ x: NaN })).toThrow();
    expect(() => canonicalStringify({ x: Infinity })).toThrow();
  });

  it('treats -0 as 0', () => {
    expect(canonicalStringify(-0)).toBe('0');
  });

  it('hashState ignores key order', () => {
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });
});

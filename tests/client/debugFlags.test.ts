import { describe, expect, it } from 'vitest';
import { parseDebugFlags } from '../../src/client/debugFlags';

describe('debug flags', () => {
  it('ignores flags when disabled', () => {
    expect(parseDebugFlags('?timescale=60&seed=5', false)).toEqual({
      timescale: 1,
      freeze: false,
      seed: null,
      scene: 'none',
      noWebgl: false,
    });
  });

  it('parses and clamps when enabled', () => {
    expect(parseDebugFlags('?timescale=9999&seed=5&scene=demo&freeze=1', true)).toEqual({
      timescale: 600,
      freeze: true,
      seed: 5,
      scene: 'demo',
      noWebgl: false,
    });
  });

  it('drops invalid values', () => {
    expect(parseDebugFlags('?timescale=abc&seed=x&scene=zz&nowebgl=1', true)).toEqual({
      timescale: 1,
      freeze: false,
      seed: null,
      scene: 'none',
      noWebgl: true,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { MINERALS } from '../../src/data/minerals';
import { contrast, ink, mix } from '../../src/ui/tokens';

type Name = keyof typeof ink;

// Text on the HUD surfaces: the pit (sheets and panels) and the slate (raised rows).
const TEXT: [Name, Name, number][] = [
  ['chalk', 'pit', 15.63],
  ['dust', 'pit', 6.99],
  ['lamp', 'pit', 9.72],
  ['pit', 'lamp', 9.72],
  ['verdant', 'pit', 9.35],
  ['hazard', 'pit', 5.12],
  ['chalk', 'slate', 13.42],
  ['dust', 'slate', 6.0],
  ['lamp', 'slate', 8.35],
  ['verdant', 'slate', 8.03],
];
const LARGE: [Name, Name, number][] = [['hazard', 'slate', 4.4]];

describe('ink contrast', () => {
  it.each(TEXT)('%s on %s is body-text safe', (f, b, v) => {
    const c = contrast(ink[f], ink[b]);
    expect(c).toBeCloseTo(v, 1);
    expect(c).toBeGreaterThanOrEqual(4.5);
  });

  it.each(LARGE)('%s on %s is large-text safe', (f, b, v) => {
    const c = contrast(ink[f], ink[b]);
    expect(c).toBeCloseTo(v, 1);
    expect(c).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(MINERALS))('the %s gem reads on the pit', (_, m) => {
    expect(contrast(m.color, ink.pit)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('mix', () => {
  it('lerps sRGB hex and returns lowercase hex', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#1B2A41', '#1B2A41', 0.3)).toBe('#1b2a41');
    expect(mix('#000000', '#FF0000', 1)).toBe('#ff0000');
  });
});

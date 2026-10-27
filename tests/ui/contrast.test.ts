import { describe, expect, it } from 'vitest';
import { contrast, mix, palette } from '../../src/ui/tokens';

type Name = keyof typeof palette;

const TEXT: [Name, Name, number][] = [
  ['offBlack', 'cream', 14.32],
  ['cream', 'navy', 11.88],
  ['rust', 'cream', 5.56],
  ['offBlack', 'mustard', 8.1],
  ['navy', 'mustard', 6.72],
  ['offBlack', 'dustyPink', 7.4],
];
const LARGE: [Name, Name, number][] = [
  ['burntOrange', 'cream', 3.62],
  ['teal', 'cream', 3.91],
];

describe('palette contrast', () => {
  it.each(TEXT)('%s on %s is body-text safe', (f, b, v) => {
    const c = contrast(palette[f], palette[b]);
    expect(c).toBeCloseTo(v, 1);
    expect(c).toBeGreaterThanOrEqual(4.5);
  });

  it.each(LARGE)('%s on %s is large-text safe', (f, b, v) => {
    const c = contrast(palette[f], palette[b]);
    expect(c).toBeCloseTo(v, 1);
    expect(c).toBeGreaterThanOrEqual(3);
  });
});

describe('mix', () => {
  it('lerps sRGB hex and returns lowercase hex', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#1B2A41', '#1B2A41', 0.3)).toBe('#1b2a41');
    expect(mix('#000000', '#FF0000', 1)).toBe('#ff0000');
  });
});

import { describe, expect, it } from 'vitest';
import { cubicBezierEase, industrialEase } from '../../src/shared/ease';

describe('ease', () => {
  it('industrialEase pins', () => {
    expect(industrialEase(0.25)).toBeCloseTo(0.0759, 4);
    expect(industrialEase(0.5)).toBeCloseTo(0.6173, 4);
    expect(industrialEase(0.75)).toBeCloseTo(0.9484, 4);
  });

  it('runs from 0 to 1 without going back', () => {
    expect(industrialEase(0)).toBe(0);
    expect(industrialEase(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const y = industrialEase(i / 100);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('a linear curve is the identity', () => {
    const linear = cubicBezierEase(0.25, 0.25, 0.75, 0.75);
    for (const t of [0.1, 0.33, 0.9]) expect(linear(t)).toBeCloseTo(t, 9);
  });
});

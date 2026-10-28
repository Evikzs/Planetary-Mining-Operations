import { describe, expect, it } from 'vitest';
import {
  formatGameDuration,
  formatMass,
  formatMoney,
  formatRealFromGame,
  trendOf,
} from '../../src/ui/format';
import { bezierPoint, flightControl } from '../../src/ui/motion/incomeTokens';

describe('format', () => {
  it('formats money, mass and durations', () => {
    expect(formatMoney(123456)).toBe('LM 1,234.56');
    expect(formatMoney(-1200)).toBe('−LM 12.00');
    expect(formatMoney(25_000_000)).toBe('LM 250,000.00');
    expect(formatMoney(0)).toBe('LM 0.00');
    expect(formatMass(850)).toBe('850 kg');
    expect(formatMass(4250)).toBe('4.25 t');
    expect(formatMass(12_345)).toBe('12.3 t');
    expect(formatMass(1_240_000)).toBe('1,240 t');
    expect(formatGameDuration(4560)).toBe('3 d 4 h');
    expect(formatGameDuration(252)).toBe('4 h 12 min');
    expect(formatGameDuration(240)).toBe('4 h');
    expect(formatGameDuration(35)).toBe('35 min');
    expect(formatRealFromGame(4560)).toBe('≈ 1 h 16 min');
    expect(formatRealFromGame(90)).toBe('≈ 2 min');
    expect(formatRealFromGame(10)).toBe('≈ 1 min');
  });

  it('trendOf uses ±2% over 24 entries', () => {
    const base = Array<number>(24).fill(100);
    expect(trendOf([...base, 103])).toBe('up');
    expect(trendOf([...base, 97])).toBe('down');
    expect(trendOf([...base, 101.9])).toBe('flat');
    expect(trendOf([...base, 98.1])).toBe('flat');
    expect(trendOf([1, ...base, 103])).toBe('up');
    expect(trendOf([100, 200])).toBe('flat');
  });
});

describe('income token flight', () => {
  it('bends through the midpoint raised by 30% of the distance', () => {
    const from = { x: 100, y: 500 };
    const to = { x: 500, y: 200 };
    const c = flightControl(from, to);
    expect(c.x).toBeCloseTo(300, 9);
    expect(c.y).toBeCloseTo(350 - 0.3 * 500, 9);
    expect(bezierPoint(from, c, to, 0)).toEqual(from);
    expect(bezierPoint(from, c, to, 1)).toEqual(to);
  });
});

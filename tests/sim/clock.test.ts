import { describe, expect, it } from 'vitest';
import { formatGameDate, nextShiftStartTick, shiftAt, tickToDate } from '../../src/sim/clock';

describe('clock', () => {
  it('tick 0 is 2091-03-01 05:00', () => {
    expect(formatGameDate(0)).toBe('2091-03-01 05:00');
    expect(tickToDate(0)).toEqual({ year: 2091, month: 3, day: 1, hour: 5, minute: 0 });
  });

  it('rolls days and years', () => {
    expect(formatGameDate(19 * 60)).toBe('2091-03-02 00:00');
    expect(formatGameDate(365 * 24 * 60)).toBe('2092-03-01 05:00');
    expect(formatGameDate((365 - 59) * 24 * 60 - 5 * 60)).toBe('2092-01-01 00:00');
  });

  it('shifts start at 06, 14, 22', () => {
    expect(shiftAt(59)).toBe(2);
    expect(shiftAt(60)).toBe(0);
    expect(shiftAt(540)).toBe(1);
    expect(shiftAt(1020)).toBe(2);
    expect(nextShiftStartTick(0)).toBe(60);
    expect(nextShiftStartTick(60)).toBe(540);
  });
});

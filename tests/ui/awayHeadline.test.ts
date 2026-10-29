import { describe, expect, it } from 'vitest';
import type { AwaySummary } from '../../src/sim/offline';
import { awayHeadline } from '../../src/ui/screens/awayHeadline';

const quiet: AwaySummary = {
  realMsAway: 7_200_000,
  gameHours: 120,
  capped: false,
  cashDeltaCents: 0,
  producedKg: {},
  soldKg: {},
  contractsCompleted: 0,
  contractsFailed: 0,
  arrivals: 0,
  departures: 0,
  alerts: [],
};

describe('away headline', () => {
  it('leads with what changed and ends with the cash', () => {
    const ore = { ...quiet, cashDeltaCents: 42_000, producedKg: { ilmenite: 30_000 } };
    expect(awayHeadline(ore, 142_000)).toBe('Ore flows\u00a0— cash up 42%');
    expect(awayHeadline(quiet, 100_000)).toBe('A quiet watch\u00a0— cash holds');
  });

  it('puts bad news first', () => {
    const lost = {
      ...quiet,
      cashDeltaCents: -8_000,
      contractsFailed: 1,
      producedKg: { steel: 9_000 },
    };
    expect(awayHeadline(lost, 92_000)).toBe('Contract lost\u00a0— cash down 8%');
    const short = {
      ...quiet,
      alerts: [{ t: 'shortage' as const, sectionId: 3, need: 'air' as const, daysLeft: 1 }],
    };
    expect(awayHeadline(short, 100_000)).toBe('Air runs short\u00a0— cash holds');
  });

  it('names the most valuable kind of output', () => {
    // 5 t of steel is worth far more than 1 t of ilmenite.
    const mill = { ...quiet, producedKg: { steel: 5_000, ilmenite: 1_000 } };
    expect(awayHeadline(mill, 100_000)).toBe('Refineries hum\u00a0— cash holds');
  });

  it('gives no percentage when there was no cash to compare with', () => {
    expect(awayHeadline({ ...quiet, cashDeltaCents: 5_000 }, 5_000)).toBe(
      'A quiet watch\u00a0— cash up',
    );
  });
});

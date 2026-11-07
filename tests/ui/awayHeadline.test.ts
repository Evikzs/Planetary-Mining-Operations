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
  netIncomeCents: 0,
  auctionsWon: 0,
  auctionsLost: 0,
  ratingFrom: 'BBB',
  ratingTo: 'BBB',
  interestPaidCents: 0,
  news: [],
  sectionsLost: 0,
};

describe('away headline', () => {
  it('leads with land seized, then a default, before everything else', () => {
    const defaulted = { t: 'defaulted' as const, companyId: 0, owedCents: 100 };
    const bad = { ...quiet, contractsFailed: 1, alerts: [defaulted] };
    expect(awayHeadline(bad, 100_000)).toBe('In default\u00a0— cash holds');
    expect(awayHeadline({ ...bad, sectionsLost: 2 }, 100_000)).toBe(
      'Lenders seize land\u00a0— cash holds',
    );
  });

  it('names an auction win after bad news and before output', () => {
    const won = { ...quiet, auctionsWon: 1, producedKg: { steel: 9_000 } };
    expect(awayHeadline(won, 100_000)).toBe('Section won at auction\u00a0— cash holds');
    expect(awayHeadline({ ...won, auctionsWon: 2 }, 100_000)).toBe(
      'Sections won at auction\u00a0— cash holds',
    );
    expect(awayHeadline({ ...won, contractsFailed: 1 }, 100_000)).toBe(
      'Contract lost\u00a0— cash holds',
    );
  });

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
      alerts: [
        { t: 'shortage' as const, companyId: 0, sectionId: 3, need: 'air' as const, daysLeft: 1 },
      ],
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

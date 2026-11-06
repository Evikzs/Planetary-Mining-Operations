import { describe, expect, it } from 'vitest';
import { DEPRECIATION_MONTHS } from '../../../src/data/finance';
import { PLAYER, playerCompany } from '../../../src/sim/companies';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { booksBalanced, netIncome } from '../../../src/sim/finance/books';
import { closeMonth, CLOSED_KEPT, ratios } from '../../../src/sim/finance/statements';
import type { GameState } from '../../../src/sim/state';

/** 2091-04-01 00:00: the first close. */
const APRIL_1 = 44_340;

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}
const books = (s: GameState) => playerCompany(s)!.books;
const closes = (events: SimEvent[]) => events.filter((e) => e.t === 'monthClosed');

describe('statements', () => {
  it('closes March 2091 at tick 44,340 and keeps the latest 12 months', () => {
    const s = founded();
    const seen: SimEvent[] = [];
    while (s.tick < APRIL_1 - 60) seen.push(...step(s, { mode: 'coarse' }));
    expect(closes(seen)).toEqual([]);
    const at = step(s, { mode: 'coarse' });
    expect(s.tick).toBe(APRIL_1);
    expect(closes(at)).toEqual([
      expect.objectContaining({ t: 'monthClosed', companyId: PLAYER, label: '2091-03' }),
    ]);
    expect(books(s).closed.map((m) => m.label)).toEqual(['2091-03']);
    for (let i = 0; i < CLOSED_KEPT + 1; i++) closeMonth(s, PLAYER, `test-${i}`);
    expect(books(s).closed).toHaveLength(CLOSED_KEPT);
    expect(books(s).closed[0]!.label).toBe(`test-${CLOSED_KEPT}`);
  });

  it('a closed month carries depreciation of cost / 24 per building', () => {
    const s = founded();
    const before = s.buildings.map((b) => ({ id: b.id, cost: b.costCents, book: b.bookCents }));
    const month = closeMonth(s, PLAYER, '2091-03');
    let total = 0;
    for (const b of before) {
      const share = Math.min(b.book, Math.round(b.cost / DEPRECIATION_MONTHS));
      total += share;
      expect(s.buildings.find((x) => x.id === b.id)!.bookCents).toBe(b.book - share);
    }
    expect(total).toBeGreaterThan(0);
    expect(month.income.expense.depreciation).toBe(total);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('retained earnings grow by the closed net income and the period starts at zero', () => {
    const s = founded();
    for (let h = 0; h < 30; h++) step(s, { mode: 'coarse' });
    const retained = books(s).retainedCents;
    const month = closeMonth(s, PLAYER, '2091-03');
    expect(month.income.netIncome).not.toBe(0);
    expect(books(s).retainedCents).toBe(retained + month.income.netIncome);
    expect(netIncome(books(s).period)).toBe(0);
    expect(books(s).period.cash).toEqual({ operating: 0, investing: 0, financing: 0 });
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('a coarse run closes the same month as a fine run, totals within 1%', () => {
    const s = founded();
    while (s.tick < APRIL_1 - 20 * 60) step(s, { mode: 'coarse' });
    const fine = structuredClone(s);
    while (s.tick < APRIL_1) step(s, { mode: 'coarse' });
    while (fine.tick < APRIL_1) step(fine, { mode: 'fine' });
    const a = books(s).closed[0]!;
    const b = books(fine).closed[0]!;
    expect(a.label).toBe('2091-03');
    expect(b.label).toBe('2091-03');
    const near = (x: number, y: number) =>
      expect(Math.abs(x - y)).toBeLessThanOrEqual(Math.max(1, Math.abs(y) * 0.01));
    near(a.income.expense.wages, b.income.expense.wages);
    near(a.income.expense.depreciation, b.income.expense.depreciation);
    near(a.balance.equity, b.balance.equity);
  });

  it('ratios are null when there is nothing to divide by', () => {
    const s = founded();
    // Shares are listed (C6), so EPS is a number; with no earnings there is no P/E.
    expect(ratios(s, PLAYER)).toMatchObject({
      eps: 0,
      pe: null,
      interestCover: null,
      currentRatio: null,
      debtToEquity: 0,
    });
  });
});

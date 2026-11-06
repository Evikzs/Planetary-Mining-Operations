import { describe, expect, it } from 'vitest';
import { cashAccount, PLAYER, playerCompany } from '../../../src/sim/companies';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { booksBalanced, openBooks } from '../../../src/sim/finance/books';
import { floatShares, fundamentalValueCents, listingOf } from '../../../src/sim/finance/shares';
import { closeMonth } from '../../../src/sim/finance/statements';
import { balance } from '../../../src/sim/ledger';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';
import { addTestCompany } from '../../helpers/companies';

function founded(): GameState {
  const s = createGame(42, { rivals: false });
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}
function withRival(): GameState {
  const s = founded();
  const w = worldOf(s);
  const sid = w.sections.find(
    (x) => x.id !== w.foundingSectionId && !x.neighbors.includes(w.foundingSectionId),
  )!.id;
  addTestCompany(s, 1, sid);
  return s;
}
function toNextHour(s: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  do events.push(...step(s, { mode: 'fine' }));
  while (s.tick % 60 !== 0);
  return events;
}
const books = (s: GameState) => playerCompany(s)!.books;

describe('shares', () => {
  it('lists every company at 100,000 shares priced at fundamental value', () => {
    const s = withRival();
    for (const co of [PLAYER, 1]) {
      const l = listingOf(s, co)!;
      expect(l.outstanding).toBe(100_000);
      expect(l.treasury).toBe(0);
      expect(l.priceCents).toBe(fundamentalValueCents(s, co));
      expect(floatShares(s, co)).toBe(100_000);
    }
  });

  it('with no orders the price follows fundamental value (±0.1%)', () => {
    const s = founded();
    toNextHour(s);
    const l = listingOf(s, PLAYER)!;
    expect(Math.abs(l.priceCents / l.fvCents - 1)).toBeLessThanOrEqual(0.001);
    expect(l.history.at(-1)).toBe(l.priceCents);
  });

  it('selling 100x the hourly turnover clears at the lower bound and returns the rest', () => {
    const s = withRival();
    // The player holds half of company 1, bought at its listing price.
    s.holdings.push({ holder: PLAYER, companyId: 1, shares: 50_000, costCents: 50_000 * 700 });
    openBooks(s, PLAYER);
    expect(
      applyCommand(s, {
        t: 'placeShareOrder',
        target: 1,
        side: 'sell',
        kind: 'market',
        qty: 50_000,
      }),
    ).toEqual({ ok: true });
    const trades = toNextHour(s).filter((e) => e.t === 'shareTrade');
    const sold = trades.reduce((n, e) => n + e.qty, 0);
    const l = listingOf(s, 1)!;
    // The clearing ran at the fair value it worked out this hour.
    expect(l.priceCents).toBe(Math.round(l.fvCents / 5));
    // NPC investors take 0.5% of the float an hour at fair value, 25 times that at a fifth of it.
    expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThan(50_000);
    expect(Number.isFinite(l.priceCents) && Number.isInteger(l.priceCents)).toBe(true);
    for (const e of trades) expect(Number.isInteger(e.cents)).toBe(true);
    const holding = s.holdings.find((h) => h.holder === PLAYER && h.companyId === 1)!;
    expect(holding.shares).toBe(50_000 - sold);
    expect(s.shareOrders).toEqual([]);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('a buyback moves shares to treasury and lowers equity by its cost', () => {
    const s = founded();
    const capital = books(s).shareCapitalCents;
    expect(
      applyCommand(s, {
        t: 'placeShareOrder',
        target: PLAYER,
        side: 'buy',
        kind: 'market',
        qty: 1_000,
      }),
    ).toEqual({ ok: true });
    const trades = toNextHour(s).filter((e) => e.t === 'shareTrade');
    const bought = trades.reduce((n, e) => n + e.qty, 0);
    const cost = trades.reduce((n, e) => n + e.cents, 0);
    expect(bought).toBe(1_000);
    expect(listingOf(s, PLAYER)!.treasury).toBe(1_000);
    expect(books(s).treasuryCents).toBe(cost);
    expect(books(s).shareCapitalCents).toBe(capital);
    expect(floatShares(s, PLAYER)).toBe(99_000);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('an issue of 20,000 shares adds the proceeds to share capital; a second issue that month fails with ISSUE_LIMIT', () => {
    const s = founded();
    const capital = books(s).shareCapitalCents;
    expect(applyCommand(s, { t: 'issueShares', qty: 20_000 })).toEqual({ ok: true });
    expect(applyCommand(s, { t: 'issueShares', qty: 1 })).toEqual({
      ok: false,
      error: 'ISSUE_LIMIT',
    });
    const trades = toNextHour(s).filter((e) => e.t === 'shareTrade');
    const sold = trades.reduce((n, e) => n + e.qty, 0);
    const proceeds = trades.reduce((n, e) => n + e.cents, 0);
    expect(sold).toBeGreaterThan(0);
    expect(listingOf(s, PLAYER)!.outstanding).toBe(100_000 + sold);
    expect(books(s).shareCapitalCents).toBe(capital + proceeds);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('dividends at the close pay holders pro rata and reduce retained earnings', () => {
    const s = withRival();
    // Company 1 holds 10% of the player.
    s.holdings.push({ holder: 1, companyId: PLAYER, shares: 10_000, costCents: 7_000_000 });
    openBooks(s, 1);
    expect(applyCommand(s, { t: 'setDividendRatio', ratio: 0.5 })).toEqual({ ok: true });
    books(s).period.revenue.other += 1_000_000;
    books(s).shareCapitalCents -= 1_000_000; // a gain with nothing behind it would unbalance the books
    const rivalCash = balance(s.ledger, cashAccount(1));
    const events: SimEvent[] = [];
    const month = closeMonth(s, PLAYER, '2091-03', events);
    const paid = events.find((e) => e.t === 'dividendPaid');
    expect(paid).toBeDefined();
    const perShare = paid!.t === 'dividendPaid' ? paid!.perShareCents : 0;
    expect(perShare).toBe(Math.floor(Math.floor(month.income.netIncome * 0.5) / 100_000));
    expect(balance(s.ledger, cashAccount(1)) - rivalCash).toBe(perShare * 10_000);
    expect(books(s).retainedCents).toBe(month.income.netIncome - perShare * 100_000);
  });

  it('crossing 20% emits one stakeDisclosed', () => {
    const s = withRival();
    s.holdings.push({ holder: PLAYER, companyId: 1, shares: 19_900, costCents: 19_900 * 700 });
    openBooks(s, PLAYER);
    applyCommand(s, { t: 'placeShareOrder', target: 1, side: 'buy', kind: 'market', qty: 300 });
    const first = toNextHour(s).filter((e) => e.t === 'stakeDisclosed');
    expect(first).toEqual([
      expect.objectContaining({ t: 'stakeDisclosed', holder: PLAYER, companyId: 1 }),
    ]);
    applyCommand(s, { t: 'placeShareOrder', target: 1, side: 'buy', kind: 'market', qty: 100 });
    expect(toNextHour(s).filter((e) => e.t === 'stakeDisclosed')).toEqual([]);
  });

  it('books stay balanced through share trades, issues, buybacks and dividends', () => {
    const s = withRival();
    applyCommand(s, { t: 'placeShareOrder', target: 1, side: 'buy', kind: 'market', qty: 2_000 });
    applyCommand(s, {
      t: 'placeShareOrder',
      target: PLAYER,
      side: 'buy',
      kind: 'limit',
      qty: 500,
      limitCents: 900,
    });
    applyCommand(s, { t: 'issueShares', qty: 5_000 });
    applyCommand(s, { t: 'setDividendRatio', ratio: 0.25 });
    for (let h = 0; h < 30; h++) step(s, { mode: 'coarse' });
    applyCommand(s, { t: 'placeShareOrder', target: 1, side: 'sell', kind: 'market', qty: 1_000 });
    for (let h = 0; h < 5; h++) step(s, { mode: 'coarse' });
    expect(booksBalanced(s, PLAYER)).toEqual([]);
    expect(booksBalanced(s, 1)).toEqual([]);
  });
});

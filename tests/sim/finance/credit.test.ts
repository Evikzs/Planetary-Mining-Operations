import { describe, expect, it } from 'vitest';
import { cashAccount, PLAYER, playerCompany } from '../../../src/sim/companies';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { booksBalanced, cashOut } from '../../../src/sim/finance/books';
import {
  borrowingRoomCents,
  creditLimitCents,
  loanRate,
  rateCompany,
} from '../../../src/sim/finance/credit';
import { balance } from '../../../src/sim/ledger';
import type { GameState } from '../../../src/sim/state';

function founded(): GameState {
  const s = createGame(42, { rivals: false });
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}
const company = (s: GameState) => playerCompany(s)!;
const cash = (s: GameState) => balance(s.ledger, cashAccount(PLAYER));
/** Leaves the player `left` cents of cash, spent as an expense so the books follow. */
const drain = (s: GameState, left: number) =>
  cashOut(s, PLAYER, cash(s) - left, { to: 'expense', line: 'other' }, 'operating');

function toNextHour(s: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  do events.push(...step(s, { mode: 'fine' }));
  while (s.tick % 60 !== 0);
  return events;
}

describe('credit', () => {
  it('a BBB loan of LM 100,000 costs 3.2% a game month, charged hour by hour', () => {
    const s = founded();
    expect(company(s).credit.rating).toBe('BBB');
    expect(loanRate('BBB')).toBeCloseTo(0.032, 10);
    expect(applyCommand(s, { t: 'takeLoan', amountCents: 10_000_000, months: 3 })).toEqual({
      ok: true,
    });
    for (let h = 0; h < 720; h++) step(s, { mode: 'coarse' });
    expect(Math.abs(company(s).books.period.expense.interest - 320_000)).toBeLessThanOrEqual(1);
  });

  it('repays the principal when due, from cash and then the credit line', () => {
    const s = founded();
    applyCommand(s, { t: 'takeLoan', amountCents: 10_000_000, months: 3 });
    const loan = s.loans[0]!;
    loan.dueTick = s.tick + 60;
    drain(s, 5_000_000);
    toNextHour(s);
    expect(s.loans).toEqual([]);
    expect(company(s).credit.creditDrawnCents).toBeGreaterThan(0);
    expect(company(s).credit.default).toBeNull();
    expect(cash(s)).toBeGreaterThanOrEqual(0);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('payroll draws the credit line when cash runs short; cash never goes negative', () => {
    const s = founded();
    drain(s, 100);
    toNextHour(s);
    expect(company(s).credit.creditDrawnCents).toBeGreaterThan(0);
    expect(company(s).payrollShortfall).toBe(false);
    expect(cash(s)).toBeGreaterThanOrEqual(0);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('a missed payment defaults: rating D, defaulted event, forced sell orders', () => {
    const s = founded();
    applyCommand(s, { t: 'takeLoan', amountCents: 10_000_000, months: 3 });
    // A debt far beyond what cash and the credit line can cover falls due now.
    s.loans[0]!.principalCents = 900_000_000;
    s.loans[0]!.dueTick = s.tick + 60;
    drain(s, 0);
    const events = toNextHour(s);
    expect(events).toContainEqual(expect.objectContaining({ t: 'defaulted', companyId: PLAYER }));
    expect(company(s).credit.rating).toBe('D');
    expect(company(s).credit.default).not.toBeNull();
    // The lender's market sell orders clear in the same hour's market.
    expect(events).toContainEqual(
      expect.objectContaining({ t: 'trade', side: 'sell', companyId: PLAYER }),
    );
    expect(applyCommand(s, { t: 'takeLoan', amountCents: 1_000_000, months: 3 })).toEqual({
      ok: false,
      error: 'NO_CREDIT',
    });
  });

  it('rates AAA with no debt and positive cash flow; CCC with D/E above 1.5 and cover below 1.5', () => {
    const s = founded();
    company(s).books.period.cash.operating = 100;
    expect(rateCompany(s, PLAYER)).toBe('AAA');
    applyCommand(s, { t: 'takeLoan', amountCents: 10_000_000, months: 3 });
    s.loans[0]!.principalCents = 3 * 75_860_000;
    company(s).books.period.cash.operating = -100;
    company(s).books.period.expense.interest = 1_000_000;
    expect(rateCompany(s, PLAYER)).toBe('CCC');
  });

  it('a state-backed company never rates below A unless in default', () => {
    const s = founded();
    company(s).archetype = 'stateBacked';
    applyCommand(s, { t: 'takeLoan', amountCents: 10_000_000, months: 3 });
    s.loans[0]!.principalCents = 3 * 75_860_000;
    company(s).books.period.cash.operating = -100;
    company(s).books.period.expense.interest = 1_000_000;
    expect(rateCompany(s, PLAYER)).toBe('A');
    company(s).credit.default = { sinceTick: s.tick };
    expect(rateCompany(s, PLAYER)).toBe('D');
  });

  it('takeLoan beyond the room fails with CREDIT_LIMIT and changes nothing', () => {
    const s = founded();
    const room = borrowingRoomCents(s, PLAYER);
    expect(room).toBeGreaterThan(0);
    const before = cash(s);
    expect(applyCommand(s, { t: 'takeLoan', amountCents: room + 100, months: 6 })).toEqual({
      ok: false,
      error: 'CREDIT_LIMIT',
    });
    expect(cash(s)).toBe(before);
    expect(s.loans).toEqual([]);
    expect(
      applyCommand(s, { t: 'drawCredit', amountCents: creditLimitCents(s, PLAYER) + 1 }),
    ).toEqual({ ok: false, error: 'CREDIT_LIMIT' });
  });

  it('books stay balanced through borrowing, interest and repayment', () => {
    const s = founded();
    applyCommand(s, { t: 'takeLoan', amountCents: 5_000_000, months: 6 });
    applyCommand(s, { t: 'drawCredit', amountCents: 1_000_000 });
    for (let h = 0; h < 50; h++) step(s, { mode: 'coarse' });
    expect(booksBalanced(s, PLAYER)).toEqual([]);
    applyCommand(s, { t: 'repayLoan', loanId: s.loans[0]!.id, amountCents: 2_000_000 });
    applyCommand(s, { t: 'repayCredit', amountCents: 1_000_000 });
    expect(company(s).credit.creditDrawnCents).toBe(0);
    expect(s.loans[0]!.principalCents).toBe(3_000_000);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });
});

import {
  BASE_RATE_PER_MONTH,
  D_RATING_CLOSES,
  DAYS_PER_LOAN_MONTH,
  LINE_FACTOR,
  LOAN_FACTOR,
  MIN_LOAN_CENTS,
  SPREAD,
  VALUATION,
} from '../../data/finance';
import { NEEDS_KG_PER_DAY } from '../../data/balance';
import type { GoodId } from '../../data/goods';
import { fail, OK, type Command, type CommandResult } from '../commands';
import { activeCompany, cashAccount, companyOf, type CompanyId } from '../companies';
import type { System } from '../engine';
import { balance } from '../ledger';
import { placeOrder } from '../market/orders';
import { residentsBySection } from '../people/housing';
import type { SimEvent } from '../events';
import { newId, type GameState } from '../state';
import { assets, cashIn, cashOut, liabilities, type FlowClass, type Posting } from './books';
import { balanceSheet, CLOSE_HOOKS, incomeStatement } from './statements';
import { pricePoints, shockSentiment } from './shares';

export type Rating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';
export const RATINGS: Rating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];

export interface Loan {
  id: number;
  companyId: CompanyId;
  principalCents: number;
  ratePerMonth: number;
  takenTick: number;
  dueTick: number;
}

/** A company's standing with lenders; part of CompanyState. */
export interface CreditState {
  rating: Rating;
  creditDrawnCents: number;
  /** Fractions of a cent of interest carried to the next hour. */
  interestRemainder: number;
  /** Payments missed and not yet made good: debt, and the reason for a default. */
  overdueCents: number;
  default: { sinceTick: number } | null;
  /** Closes left at D after a default is cured. */
  dRatingCloses: number;
}

export const freshCredit = (): CreditState => ({
  rating: 'BBB',
  creditDrawnCents: 0,
  interestRemainder: 0,
  overdueCents: 0,
  default: null,
  dRatingCloses: 0,
});

const HOURS_PER_MONTH = DAYS_PER_LOAN_MONTH * 24;

/** The monthly rate a new loan gets; none at D. */
export function loanRate(rating: Rating): number | null {
  return rating === 'D' ? null : BASE_RATE_PER_MONTH + SPREAD[rating];
}

/** The rate on debt already owed, which runs on at the CCC rate through a default. */
const debtRate = (rating: Rating): number =>
  BASE_RATE_PER_MONTH + SPREAD[rating === 'D' ? 'CCC' : rating];

const equityOf = (state: GameState, co: CompanyId): number =>
  assets(state, co).total - liabilities(state, co);

export function loansOf(state: GameState, co: CompanyId): number {
  let sum = 0;
  for (const l of state.loans) if (l.companyId === co) sum += l.principalCents;
  return sum;
}

export function creditLimitCents(state: GameState, co: CompanyId): number {
  const c = companyOf(state, co)!;
  return Math.max(0, Math.floor(LINE_FACTOR[c.credit.rating] * equityOf(state, co)));
}

/** How much more a company may borrow: loans and credit together stay within its rating's share of equity. */
export function borrowingRoomCents(state: GameState, co: CompanyId): number {
  const c = companyOf(state, co)!;
  const cap = Math.floor(LOAN_FACTOR[c.credit.rating] * equityOf(state, co));
  return Math.max(0, cap - loansOf(state, co) - c.credit.creditDrawnCents);
}

function draw(state: GameState, co: CompanyId, cents: number): void {
  cashIn(state, co, cents, { to: 'liability' }, 'financing');
  companyOf(state, co)!.credit.creditDrawnCents += cents;
}

/** Pays from cash, drawing the credit line for any shortfall. False, and no change, when both are short. */
export function payDue(
  state: GameState,
  co: CompanyId,
  cents: number,
  posting: Posting,
  flow: FlowClass,
): boolean {
  if (cents <= 0) return true;
  const c = companyOf(state, co)!;
  const short = cents - balance(state.ledger, cashAccount(co));
  if (short > 0) {
    if (c.credit.rating === 'D') return false;
    if (short > creditLimitCents(state, co) - c.credit.creditDrawnCents) return false;
    draw(state, co, short);
  }
  return cashOut(state, co, cents, posting, flow);
}

/** Rating points from the month's statements; see the plan's table. */
export function rateCompany(state: GameState, co: CompanyId): Rating {
  const c = companyOf(state, co)!;
  if (c.credit.default || c.credit.dRatingCloses > 0) return 'D';
  const income = incomeStatement(c.books.period);
  const sheet = balanceSheet(state, co);
  const debt = sheet.liabilities;
  const de = sheet.equity > 0 ? debt / sheet.equity : Infinity;
  let points = de <= 0.25 ? 3 : de <= 0.75 ? 2 : de <= 1.5 ? 1 : 0;
  const interest = income.expense.interest;
  const cover = interest > 0 ? (income.netIncome + interest) / interest : Infinity;
  points += cover >= 8 ? 3 : cover >= 4 ? 2 : cover >= 1.5 ? 1 : 0;
  if (c.books.period.cash.operating > 0) points += 2;
  points += pricePoints(state, co);
  const rating: Rating =
    points >= 9
      ? 'AAA'
      : points === 8
        ? 'AA'
        : points === 7
          ? 'A'
          : points === 6
            ? 'BBB'
            : points === 5
              ? 'BB'
              : points === 4
                ? 'B'
                : 'CCC';
  if (c.archetype === 'stateBacked' && RATINGS.indexOf(rating) > RATINGS.indexOf('A')) return 'A';
  return rating;
}

function setRating(state: GameState, co: CompanyId, to: Rating, events: SimEvent[]): void {
  const c = companyOf(state, co)!;
  if (c.credit.rating === to) return;
  events.push({ t: 'ratingChanged', companyId: co, from: c.credit.rating, to });
  // Each notch moves the market's mood: up for an upgrade, down for a cut.
  shockSentiment(
    state,
    co,
    (RATINGS.indexOf(c.credit.rating) - RATINGS.indexOf(to)) * VALUATION.notchShock,
  );
  c.credit.rating = to;
}

// The rating review runs at each close, after the dividends (C6 puts those first).
CLOSE_HOOKS.push((state, co, events) => {
  const c = companyOf(state, co)!;
  setRating(state, co, rateCompany(state, co), events);
  if (!c.credit.default && c.credit.dRatingCloses > 0) c.credit.dRatingCloses--;
});

export function takeLoan(
  state: GameState,
  cmd: Extract<Command, { t: 'takeLoan' }>,
  actor: CompanyId,
): CommandResult {
  const c = activeCompany(state, actor);
  if (!c) return fail('NOT_FOUNDED');
  const rate = loanRate(c.credit.rating);
  if (rate === null) return fail('NO_CREDIT');
  if (![3, 6, 12].includes(cmd.months) || !Number.isSafeInteger(cmd.amountCents)) {
    return fail('INVALID_ORDER');
  }
  if (cmd.amountCents < MIN_LOAN_CENTS || cmd.amountCents > borrowingRoomCents(state, actor)) {
    return fail('CREDIT_LIMIT');
  }
  state.loans.push({
    id: newId(state),
    companyId: actor,
    principalCents: cmd.amountCents,
    ratePerMonth: rate,
    takenTick: state.tick,
    dueTick: state.tick + cmd.months * DAYS_PER_LOAN_MONTH * 1440,
  });
  cashIn(state, actor, cmd.amountCents, { to: 'liability' }, 'financing');
  return OK;
}

export function repayLoan(
  state: GameState,
  cmd: Extract<Command, { t: 'repayLoan' }>,
  actor: CompanyId,
): CommandResult {
  if (!activeCompany(state, actor)) return fail('NOT_FOUNDED');
  const loan = state.loans.find((l) => l.id === cmd.loanId);
  if (!loan) return fail('UNKNOWN_ID');
  if (loan.companyId !== actor) return fail('NOT_OWNED');
  const pay = Math.min(cmd.amountCents, loan.principalCents);
  if (!Number.isSafeInteger(pay) || pay <= 0) return fail('INVALID_ORDER');
  if (!cashOut(state, actor, pay, { to: 'liability' }, 'financing'))
    return fail('INSUFFICIENT_CASH');
  loan.principalCents -= pay;
  if (loan.principalCents === 0) state.loans = state.loans.filter((l) => l !== loan);
  return OK;
}

export function drawCredit(state: GameState, amountCents: number, actor: CompanyId): CommandResult {
  const c = activeCompany(state, actor);
  if (!c) return fail('NOT_FOUNDED');
  if (c.credit.rating === 'D') return fail('NO_CREDIT');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return fail('INVALID_ORDER');
  if (amountCents > creditLimitCents(state, actor) - c.credit.creditDrawnCents) {
    return fail('CREDIT_LIMIT');
  }
  draw(state, actor, amountCents);
  return OK;
}

export function repayCredit(
  state: GameState,
  amountCents: number,
  actor: CompanyId,
): CommandResult {
  const c = activeCompany(state, actor);
  if (!c) return fail('NOT_FOUNDED');
  const pay = Math.min(amountCents, c.credit.creditDrawnCents);
  if (!Number.isSafeInteger(pay) || pay <= 0) return fail('INVALID_ORDER');
  if (!cashOut(state, actor, pay, { to: 'liability' }, 'financing'))
    return fail('INSUFFICIENT_CASH');
  c.credit.creditDrawnCents -= pay;
  return OK;
}

/** A payment that could not be made: it stays owed, and the first one starts a default. */
function miss(state: GameState, co: CompanyId, cents: number, events: SimEvent[]): void {
  const c = companyOf(state, co)!;
  c.credit.overdueCents += cents;
  if (c.credit.default) return;
  c.credit.default = { sinceTick: state.tick };
  events.push({ t: 'defaulted', companyId: co, owedCents: c.credit.overdueCents });
  shockSentiment(state, co, VALUATION.defaultShock);
  setRating(state, co, 'D', events);
}

/** While in default the lender sells the depots' stock, keeping a day of residents' needs. */
function forceSales(state: GameState, co: CompanyId): void {
  const residents = residentsBySection(state);
  for (const section of state.sections) {
    if (section.owner !== co) continue;
    const keep: Partial<Record<GoodId, number>> = {
      oxygen: Math.ceil(NEEDS_KG_PER_DAY.oxygen * (residents.get(section.id) ?? 0)),
      potableWater: Math.ceil(NEEDS_KG_PER_DAY.potableWater * (residents.get(section.id) ?? 0)),
      hydroponicProduce: Math.ceil(
        NEEDS_KG_PER_DAY.hydroponicProduce * (residents.get(section.id) ?? 0),
      ),
    };
    for (const [g, kg] of Object.entries(section.depot) as [GoodId, number][]) {
      const qty = kg - (keep[g] ?? 0);
      const selling = state.orders.some(
        (o) =>
          o.companyId === co && o.sectionId === section.id && o.goodId === g && o.side === 'sell',
      );
      if (qty <= 0 || selling) continue;
      placeOrder(
        state,
        {
          t: 'placeOrder',
          goodId: g,
          side: 'sell',
          kind: 'market',
          qtyKg: qty,
          sectionId: section.id,
        },
        co,
      );
    }
  }
}

/** Each game hour: interest, loans that fall due, overdue debt, and a default's forced sales. */
export const creditSystem: System = {
  id: 'credit',
  step(state, ctx) {
    if (state.tick % 60 !== 0) return;
    for (const c of state.companies) {
      if (c.status !== 'active') continue;
      const co = c.id;
      // Interest on loans, the credit line and overdue debt.
      let owed = c.credit.interestRemainder;
      for (const l of state.loans)
        if (l.companyId === co) owed += (l.principalCents * l.ratePerMonth) / HOURS_PER_MONTH;
      owed +=
        ((c.credit.creditDrawnCents + c.credit.overdueCents) * debtRate(c.credit.rating)) /
        HOURS_PER_MONTH;
      const whole = Math.floor(owed);
      c.credit.interestRemainder = owed - whole;
      if (
        whole > 0 &&
        !payDue(state, co, whole, { to: 'expense', line: 'interest' }, 'operating')
      ) {
        // Unpaid interest is booked as a cost and owed on top of the debt.
        c.books.period.expense.interest += whole;
        miss(state, co, whole, ctx.events);
      }
      // Loans that fall due.
      for (const l of state.loans.filter((x) => x.companyId === co && x.dueTick <= state.tick)) {
        state.loans = state.loans.filter((x) => x !== l);
        if (!payDue(state, co, l.principalCents, { to: 'liability' }, 'financing')) {
          miss(state, co, l.principalCents, ctx.events);
        }
      }
      // Overdue debt is paid from cash first; at zero the default is cured.
      if (c.credit.overdueCents > 0) {
        const pay = Math.min(c.credit.overdueCents, balance(state.ledger, cashAccount(co)));
        if (pay > 0 && cashOut(state, co, pay, { to: 'liability' }, 'financing')) {
          c.credit.overdueCents -= pay;
        }
      }
      if (c.credit.default && c.credit.overdueCents === 0) {
        c.credit.default = null;
        c.credit.dRatingCloses = D_RATING_CLOSES;
        ctx.events.push({ t: 'defaultCured', companyId: co });
      } else if (c.credit.default) {
        forceSales(state, co);
      }
    }
  },
};

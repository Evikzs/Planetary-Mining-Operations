import { DEPRECIATION_MONTHS } from '../../data/finance';
import { tickToDate } from '../clock';
import { companyOf, type CompanyId } from '../companies';
import type { System } from '../engine';
import type { GameState } from '../state';
import {
  assets,
  emptyPeriod,
  liabilities,
  netIncome,
  type ExpenseLine,
  type Period,
  type RevenueLine,
} from './books';

export interface IncomeStatement {
  revenue: Record<RevenueLine, number>;
  expense: Record<ExpenseLine, number>;
  netIncome: number;
}
export interface CashFlowStatement {
  operating: number;
  investing: number;
  financing: number;
  net: number;
}
export interface BalanceSheet {
  cash: number;
  inventory: number;
  buildings: number;
  land: number;
  investments: number;
  assets: number;
  loans: number;
  credit: number;
  liabilities: number;
  shareCapital: number;
  treasury: number;
  retained: number;
  netIncome: number;
  equity: number;
}
export interface ClosedMonth {
  /** 'YYYY-MM' of the month that closed. */
  label: string;
  income: IncomeStatement;
  cashFlow: CashFlowStatement;
  balance: BalanceSheet;
  sharePriceCents: number | null;
}
export interface Ratios {
  eps: number | null;
  pe: number | null;
  roe: number | null;
  debtToEquity: number | null;
  interestCover: number | null;
  currentRatio: number | null;
}

/** Months a company keeps on record. */
export const CLOSED_KEPT = 12;

export function incomeStatement(p: Period): IncomeStatement {
  return { revenue: { ...p.revenue }, expense: { ...p.expense }, netIncome: netIncome(p) };
}

export function cashFlowStatement(p: Period): CashFlowStatement {
  const { operating, investing, financing } = p.cash;
  return { operating, investing, financing, net: operating + investing + financing };
}

export function balanceSheet(state: GameState, co: CompanyId): BalanceSheet {
  const books = companyOf(state, co)!.books;
  const a = assets(state, co);
  const debt = liabilities(state, co);
  const income = netIncome(books.period);
  return {
    cash: a.cash,
    inventory: a.inventory,
    buildings: a.buildings,
    land: a.land,
    investments: a.investments,
    assets: a.total,
    loans: 0,
    credit: 0,
    liabilities: debt,
    shareCapital: books.shareCapitalCents,
    treasury: books.treasuryCents,
    retained: books.retainedCents,
    netIncome: income,
    equity: books.shareCapitalCents - books.treasuryCents + books.retainedCents + income,
  };
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Ratios from the last closed month, or from the month so far before the first close. */
export function ratios(state: GameState, co: CompanyId): Ratios {
  const books = companyOf(state, co)!.books;
  const last = books.closed[0];
  const income = last ? last.income : incomeStatement(books.period);
  const balance = last ? last.balance : balanceSheet(state, co);
  const interest = income.expense.interest;
  return {
    eps: null,
    pe: null,
    roe: ratio(income.netIncome * 12, balance.equity),
    debtToEquity: ratio(balance.loans + balance.credit, balance.equity),
    interestCover: ratio(income.netIncome + interest, interest),
    currentRatio: ratio(balance.cash + balance.inventory, balance.credit),
  };
}

/** Steps that run at each close, after depreciation and before the record: dividends, rating. */
export const CLOSE_HOOKS: ((state: GameState, co: CompanyId) => void)[] = [];

/** Closes one company's month: depreciation, the hooks, the record, retained earnings. */
export function closeMonth(state: GameState, co: CompanyId, label: string): ClosedMonth {
  const company = companyOf(state, co)!;
  const books = company.books;
  const mine = new Set(state.sections.filter((s) => s.owner === co).map((s) => s.id));
  for (const b of state.buildings) {
    if (!mine.has(b.sectionId)) continue;
    const share = Math.min(b.bookCents, Math.round(b.costCents / DEPRECIATION_MONTHS));
    b.bookCents -= share;
    books.period.expense.depreciation += share;
  }
  for (const hook of CLOSE_HOOKS) hook(state, co);
  const month: ClosedMonth = {
    label,
    income: incomeStatement(books.period),
    cashFlow: cashFlowStatement(books.period),
    balance: balanceSheet(state, co),
    sharePriceCents: null,
  };
  books.closed.unshift(month);
  books.closed.length = Math.min(books.closed.length, CLOSED_KEPT);
  books.retainedCents += month.income.netIncome;
  books.period = emptyPeriod();
  return month;
}

const label = (tick: number): string => {
  const d = tickToDate(tick);
  return `${d.year}-${String(d.month).padStart(2, '0')}`;
};

/** At 00:00 on day 1, every active company closes the month just ended. */
export const closeSystem: System = {
  id: 'close',
  step(state, ctx) {
    const d = tickToDate(state.tick);
    if (d.day !== 1 || d.hour !== 0 || d.minute !== 0) return;
    const ended = label(state.tick - 1);
    for (const c of state.companies) {
      if (c.status !== 'active') continue;
      const month = closeMonth(state, c.id, ended);
      ctx.events.push({
        t: 'monthClosed',
        companyId: c.id,
        label: ended,
        netIncomeCents: month.income.netIncome,
      });
    }
  },
};

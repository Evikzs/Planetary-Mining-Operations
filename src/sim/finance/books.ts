import { BUILDINGS } from '../../data/buildings';
import { upgradeCost } from '../../data/balance';
import { GOODS, type GoodId } from '../../data/goods';
import { cashAccount, companyOf, type CompanyId, type CompanyState } from '../companies';
import { balance, transfer } from '../ledger';
import type { Building, GameState } from '../state';
import type { ClosedMonth } from './statements';

/** Goods a company holds anywhere, at their average cost. */
export interface CostPool {
  kg: number;
  basisCents: number;
}
export type RevenueLine = 'sales' | 'contracts' | 'other';
export type ExpenseLine =
  | 'cogs'
  | 'materials'
  | 'lifeSupport'
  | 'wages'
  | 'depreciation'
  | 'interest'
  | 'fees'
  | 'writeOffs'
  | 'other';
export type FlowClass = 'operating' | 'investing' | 'financing';
/** Month-to-date accounts. */
export interface Period {
  revenue: Record<RevenueLine, number>;
  expense: Record<ExpenseLine, number>;
  cash: Record<FlowClass, number>;
}
export interface Books {
  pools: Partial<Record<GoodId, CostPool>>;
  landCents: number;
  shareCapitalCents: number;
  treasuryCents: number;
  retainedCents: number;
  period: Period;
  /** Closed months, newest first (latest 12). */
  closed: ClosedMonth[];
}
/** Where a cash movement lands besides the cash account. */
export type Posting =
  | { to: 'revenue'; line: RevenueLine }
  | { to: 'expense'; line: ExpenseLine }
  /** The caller records the asset: a pool, a building, land, a holding. */
  | { to: 'asset' }
  /** The caller records the debt. */
  | { to: 'liability' }
  | { to: 'equity'; account: 'shareCapital' | 'treasury' | 'retained' };

export function emptyPeriod(): Period {
  return {
    revenue: { sales: 0, contracts: 0, other: 0 },
    expense: {
      cogs: 0,
      materials: 0,
      lifeSupport: 0,
      wages: 0,
      depreciation: 0,
      interest: 0,
      fees: 0,
      writeOffs: 0,
      other: 0,
    },
    cash: { operating: 0, investing: 0, financing: 0 },
  };
}

export function emptyBooks(): Books {
  return {
    pools: {},
    landCents: 0,
    shareCapitalCents: 0,
    treasuryCents: 0,
    retainedCents: 0,
    period: emptyPeriod(),
    closed: [],
  };
}

const booksCompany = (state: GameState, co: CompanyId): CompanyState => companyOf(state, co)!;
const booksOf = (state: GameState, co: CompanyId): Books => booksCompany(state, co).books;

/** The other side of a cash movement: income, equity, or nothing for assets and debts. */
function post(books: Books, cents: number, posting: Posting, flow: FlowClass, sign: 1 | -1): void {
  books.period.cash[flow] += sign * cents;
  if (posting.to === 'revenue') books.period.revenue[posting.line] += sign * cents;
  else if (posting.to === 'expense') books.period.expense[posting.line] -= sign * cents;
  else if (posting.to === 'equity') {
    if (posting.account === 'shareCapital') books.shareCapitalCents += sign * cents;
    else if (posting.account === 'treasury') books.treasuryCents -= sign * cents;
    else books.retainedCents += sign * cents;
  }
}

/** Cash from the world to a company, with its other side. */
export function cashIn(
  state: GameState,
  co: CompanyId,
  cents: number,
  posting: Posting,
  flow: FlowClass,
): void {
  if (cents === 0) return;
  transfer(state.ledger, 'world', cashAccount(co), cents);
  post(booksOf(state, co), cents, posting, flow, 1);
}

/** Cash from a company to the world, with its other side. False, and no change, when short. */
export function cashOut(
  state: GameState,
  co: CompanyId,
  cents: number,
  posting: Posting,
  flow: FlowClass,
): boolean {
  if (cents === 0) return true;
  if (!transfer(state.ledger, cashAccount(co), 'world', cents)) return false;
  post(booksOf(state, co), cents, posting, flow, -1);
  return true;
}

/** The other side of cash that already left through an order's escrow account. */
export function recordCashOut(
  state: GameState,
  co: CompanyId,
  cents: number,
  posting: Posting,
  flow: FlowClass,
): void {
  post(booksOf(state, co), cents, posting, flow, -1);
}

/** A gain or a loss that moves no cash. */
export function recognize(state: GameState, co: CompanyId, gainCents: number): void {
  const period = booksOf(state, co).period;
  if (gainCents >= 0) period.revenue.other += gainCents;
  else period.expense.writeOffs -= gainCents;
}

export function receiveGoods(
  state: GameState,
  co: CompanyId,
  goodId: GoodId,
  kg: number,
  basisCents: number,
): void {
  if (kg === 0 && basisCents === 0) return;
  const pools = booksOf(state, co).pools;
  const pool = (pools[goodId] ??= { kg: 0, basisCents: 0 });
  pool.kg += kg;
  pool.basisCents += basisCents;
}

/** Takes goods off the books at average cost. Returns the cost removed, expensed unless capitalised. */
export function releaseGoods(
  state: GameState,
  co: CompanyId,
  goodId: GoodId,
  kg: number,
  line: ExpenseLine | 'capitalise',
): number {
  if (kg <= 0) return 0;
  const books = booksOf(state, co);
  const pool = books.pools[goodId] ?? { kg: 0, basisCents: 0 };
  const basis = kg >= pool.kg ? pool.basisCents : Math.round((pool.basisCents * kg) / pool.kg);
  pool.kg -= kg;
  pool.basisCents -= basis;
  if (pool.kg === 0 && pool.basisCents === 0) delete books.pools[goodId];
  else books.pools[goodId] = pool;
  if (line !== 'capitalise') books.period.expense[line] += basis;
  return basis;
}

export function netIncome(p: Period): number {
  let n = 0;
  for (const v of Object.values(p.revenue)) n += v;
  for (const v of Object.values(p.expense)) n -= v;
  return n;
}

/** Kg of every good a company holds: depots, building buffers, belts, and sell orders' escrow. */
export function holdings(state: GameState, co: CompanyId): Partial<Record<GoodId, number>> {
  const mine = new Set(state.sections.filter((s) => s.owner === co).map((s) => s.id));
  const out: Partial<Record<GoodId, number>> = {};
  const count = (inv: Partial<Record<GoodId, number>>) => {
    for (const [g, kg] of Object.entries(inv) as [GoodId, number][]) out[g] = (out[g] ?? 0) + kg;
  };
  for (const s of state.sections) if (mine.has(s.id)) count(s.depot);
  for (const b of state.buildings) {
    if (!mine.has(b.sectionId)) continue;
    count(b.input);
    count(b.output);
  }
  for (const belt of state.belts) {
    if (!mine.has(belt.sectionId)) continue;
    for (const lane of [belt.out, belt.in]) {
      for (const batch of lane.batches) out[batch.goodId] = (out[batch.goodId] ?? 0) + batch.kg;
    }
  }
  for (const o of state.orders) {
    if (o.companyId === co && o.escrowKg > 0) out[o.goodId] = (out[o.goodId] ?? 0) + o.escrowKg;
  }
  return out;
}

export const heldKg = (state: GameState, co: CompanyId, goodId: GoodId): number =>
  holdings(state, co)[goodId] ?? 0;

export interface Assets {
  cash: number;
  inventory: number;
  buildings: number;
  land: number;
  investments: number;
  total: number;
}

export function assets(state: GameState, co: CompanyId): Assets {
  const books = booksOf(state, co);
  let cash = balance(state.ledger, cashAccount(co));
  for (const o of state.orders) {
    if (o.companyId === co) cash += balance(state.ledger, `escrow:${o.id}`);
  }
  for (const o of state.shareOrders) {
    if (o.companyId === co) cash += balance(state.ledger, `escrow:${o.id}`);
  }
  let inventory = 0;
  for (const pool of Object.values(books.pools)) inventory += pool.basisCents;
  const mine = new Set(state.sections.filter((s) => s.owner === co).map((s) => s.id));
  let buildings = 0;
  for (const b of state.buildings) if (mine.has(b.sectionId)) buildings += b.bookCents;
  const land = books.landCents;
  let investments = 0;
  for (const h of state.holdings) if (h.holder === co) investments += h.costCents;
  return {
    cash,
    inventory,
    buildings,
    land,
    investments,
    total: cash + inventory + buildings + land + investments,
  };
}

/** Debts: loans, the drawn credit line, and payments overdue. */
export function liabilities(state: GameState, co: CompanyId): number {
  const credit = booksCompany(state, co).credit;
  let debt = credit.creditDrawnCents + credit.overdueCents;
  for (const l of state.loans) if (l.companyId === co) debt += l.principalCents;
  return debt;
}

export function equityAccounts(c: CompanyState): number {
  const b = c.books;
  return b.shareCapitalCents - b.treasuryCents + b.retainedCents + netIncome(b.period);
}

/** Every way a company's books disagree with its holdings; [] when they balance. */
export function booksBalanced(state: GameState, co: CompanyId): string[] {
  const company = companyOf(state, co);
  if (!company) return [];
  const problems: string[] = [];
  const net = assets(state, co).total - liabilities(state, co);
  const equity = equityAccounts(company);
  if (net !== equity) problems.push(`company ${co}: net assets ${net} ≠ equity accounts ${equity}`);
  const held = holdings(state, co);
  for (const g of Object.keys(GOODS) as GoodId[]) {
    const pool = company.books.pools[g];
    const kg = held[g] ?? 0;
    if ((pool?.kg ?? 0) !== kg) {
      problems.push(`company ${co}: books hold ${pool?.kg ?? 0} kg ${g}, holdings ${kg}`);
    }
    if (pool && (pool.basisCents < 0 || (pool.kg === 0 && pool.basisCents !== 0)))
      problems.push(`company ${co}: ${g} cost ${pool.basisCents} for ${pool.kg} kg`);
  }
  return problems;
}

/** What goods are worth at their base price. */
export const baseValueCents = (g: GoodId, kg: number): number =>
  Math.round((kg * GOODS[g].basePriceCents) / 1000);

/** What a building cost to put up and raise to its level, materials at base price. */
export function listCostCents(b: Pick<Building, 'type' | 'level'>): number {
  const def = BUILDINGS[b.type];
  const materials = (m: Partial<Record<GoodId, number>>) =>
    Object.entries(m).reduce(
      (sum, [g, t]) => sum + baseValueCents(g as GoodId, Math.round(t * 1000)),
      0,
    );
  let cents = def.cost.cents + materials(def.cost.materials);
  for (let level = 1; level < b.level; level++) {
    const up = upgradeCost(def, level);
    cents += up.cents + materials(up.materials);
  }
  return cents;
}

/**
 * Opens books from what a company holds now: goods at base price, buildings at list cost, no
 * land on record, and share capital that balances them. For saves and scenes built without books.
 */
export function openBooks(state: GameState, co: CompanyId): void {
  const company = companyOf(state, co)!;
  company.books = emptyBooks();
  for (const [g, kg] of Object.entries(holdings(state, co)) as [GoodId, number][]) {
    if (kg > 0) company.books.pools[g] = { kg, basisCents: baseValueCents(g, kg) };
  }
  for (const b of state.buildings) {
    if (state.sections.find((s) => s.id === b.sectionId)?.owner !== co) continue;
    b.costCents = listCostCents(b);
    b.bookCents = b.costCents;
  }
  company.books.shareCapitalCents = assets(state, co).total - liabilities(state, co);
}

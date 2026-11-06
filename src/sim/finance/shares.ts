import { SHARES, VALUATION } from '../../data/finance';
import { tickToDate } from '../clock';
import { fail, OK, type Command, type CommandResult } from '../commands';
import { activeCompany, cashAccount, companyOf, type CompanyId } from '../companies';
import type { StepContext, System } from '../engine';
import type { SimEvent } from '../events';
import { balance, transfer } from '../ledger';
import { clearBook, type BookOrder } from '../market/clearing';
import { createRng, deriveSeed } from '../rng';
import { newId, type GameState } from '../state';
import { assets, cashIn, cashOut, liabilities, netIncome, recognize, recordCashOut } from './books';
import { CLOSE_HOOKS } from './statements';

export interface Listing {
  companyId: CompanyId;
  outstanding: number;
  /** Shares the company bought back and holds. */
  treasury: number;
  priceCents: number;
  /** Fundamental value per share at the last clearing. */
  fvCents: number;
  sentiment: number;
  /** Hourly prices, latest 720 (30 game days). */
  history: number[];
  dividendRatio: number;
  issuedThisMonth: number;
}

export interface Holding {
  holder: CompanyId;
  companyId: CompanyId;
  shares: number;
  costCents: number;
  /** Set once the holder has disclosed a stake of 20% or more; cleared below it. */
  disclosed?: boolean;
}

export interface ShareOrder {
  id: number;
  /** The company that placed it. */
  companyId: CompanyId;
  /** The company whose shares change hands. */
  target: CompanyId;
  side: 'buy' | 'sell';
  kind: 'market' | 'limit';
  qty: number;
  filled: number;
  limitCents: number | null;
  /** Shares a sell order holds back; new shares for an issue. */
  escrowShares: number;
  /** Cash a buy order holds, in ledger account escrow:<id>. */
  escrowCents: number;
  issue: boolean;
}

const HISTORY_HOURS = 720;

export const listingOf = (state: GameState, co: CompanyId): Listing | undefined =>
  state.listings.find((l) => l.companyId === co);

const sharesInIssue = (l: Listing) => l.outstanding - l.treasury;

/** Shares in the hands of the public: neither in treasury nor held by a company. */
export function floatShares(state: GameState, co: CompanyId): number {
  const l = listingOf(state, co);
  if (!l) return 0;
  let held = 0;
  for (const h of state.holdings) if (h.companyId === co) held += h.shares;
  return sharesInIssue(l) - held;
}

/** Hours of the current accounting period: since the month began, or since founding. */
function periodHours(state: GameState, co: CompanyId): number {
  const d = tickToDate(state.tick);
  const monthStart = state.tick - (((d.day - 1) * 24 + d.hour) * 60 + d.minute);
  return (state.tick - Math.max(monthStart, companyOf(state, co)!.foundedTick)) / 60;
}

/** Earnings per share for a month: the last close, else the month so far scaled to 30 days. */
function monthlyEps(state: GameState, co: CompanyId, shares: number): number {
  const books = companyOf(state, co)!.books;
  const last = books.closed[0];
  if (last) return last.income.netIncome / shares;
  const hours = periodHours(state, co);
  if (hours < 24) return 0;
  return (netIncome(books.period) * (720 / hours)) / shares;
}

export function fundamentalValueCents(state: GameState, co: CompanyId): number {
  const c = companyOf(state, co)!;
  const l = listingOf(state, co);
  const shares = l ? sharesInIssue(l) : SHARES.outstandingAtListing;
  const bookPerShare = (assets(state, co).total - liabilities(state, co)) / shares;
  const eps = monthlyEps(state, co, shares);
  const base = Math.max(
    VALUATION.bookFloor * bookPerShare,
    bookPerShare + VALUATION.earningsMonths * Math.max(0, eps),
  );
  const fv = base * (0.9 + c.reputation.group / 200) * Math.exp(l?.sentiment ?? 0);
  return Math.max(1, Math.round(fv));
}

/** Lists a new company: 100,000 shares, all with the public, priced at fundamental value. */
export function listCompany(state: GameState, co: CompanyId): Listing {
  const listing: Listing = {
    companyId: co,
    outstanding: SHARES.outstandingAtListing,
    treasury: 0,
    priceCents: 0,
    fvCents: 0,
    sentiment: 0,
    history: [],
    dividendRatio: 0,
    issuedThisMonth: 0,
  };
  state.listings.push(listing);
  listing.fvCents = fundamentalValueCents(state, co);
  listing.priceCents = listing.fvCents;
  return listing;
}

/** Moves a company's market mood, kept within [-1, 1]. */
export function shockSentiment(state: GameState, co: CompanyId, delta: number): void {
  const l = listingOf(state, co);
  if (l) l.sentiment = Math.max(-1, Math.min(1, l.sentiment + delta));
}

/** One point of the credit rating: the price holds within 20% of its 30-day high. */
export function pricePoints(state: GameState, co: CompanyId): number {
  const l = listingOf(state, co);
  if (!l || l.history.length === 0) return 1;
  return l.priceCents >= 0.8 * Math.max(...l.history) ? 1 : 0;
}

function holdingOf(state: GameState, holder: CompanyId, co: CompanyId): Holding | undefined {
  return state.holdings.find((h) => h.holder === holder && h.companyId === co);
}

/** Shares a holder has not yet promised to a sell order. */
function freeShares(state: GameState, holder: CompanyId, co: CompanyId): number {
  let promised = 0;
  for (const o of state.shareOrders) {
    if (o.companyId === holder && o.target === co && o.side === 'sell' && !o.issue) {
      promised += o.escrowShares;
    }
  }
  return (holdingOf(state, holder, co)?.shares ?? 0) - promised;
}

export function placeShareOrder(
  state: GameState,
  cmd: Extract<Command, { t: 'placeShareOrder' }>,
  actor: CompanyId,
): CommandResult {
  if (!activeCompany(state, actor)) return fail('NOT_FOUNDED');
  const listing = listingOf(state, cmd.target);
  if (!listing) return fail('UNKNOWN_ID');
  const limit = cmd.kind === 'market' ? null : (cmd.limitCents ?? null);
  if (!Number.isSafeInteger(cmd.qty) || cmd.qty <= 0) return fail('INVALID_ORDER');
  if (cmd.kind === 'limit' && !(limit !== null && Number.isSafeInteger(limit) && limit > 0)) {
    return fail('INVALID_ORDER');
  }
  const order: ShareOrder = {
    id: newId(state),
    companyId: actor,
    target: cmd.target,
    side: cmd.side,
    kind: cmd.kind,
    qty: cmd.qty,
    filled: 0,
    limitCents: limit,
    escrowShares: 0,
    escrowCents: 0,
    issue: false,
  };
  if (cmd.side === 'sell') {
    // A company sells its own new shares with issueShares.
    if (cmd.target === actor) return fail('INVALID_ORDER');
    if (freeShares(state, actor, cmd.target) < cmd.qty) return fail('INSUFFICIENT_SHARES');
    order.escrowShares = cmd.qty;
  } else {
    const price = limit ?? SHARES.marketBuyEscrowFactor * listing.priceCents;
    const cents = price * cmd.qty;
    if (!Number.isSafeInteger(cents)) return fail('INVALID_ORDER');
    if (!transfer(state.ledger, cashAccount(actor), `escrow:${order.id}`, cents)) {
      return fail('INSUFFICIENT_CASH');
    }
    order.escrowCents = cents;
  }
  state.shareOrders.push(order);
  return OK;
}

function closeShareOrder(state: GameState, order: ShareOrder): void {
  const account = `escrow:${order.id}` as const;
  transfer(state.ledger, account, cashAccount(order.companyId), balance(state.ledger, account));
  delete state.ledger.balances[account];
  state.shareOrders = state.shareOrders.filter((o) => o !== order);
}

export function cancelShareOrder(
  state: GameState,
  orderId: number,
  actor: CompanyId,
): CommandResult {
  if (!activeCompany(state, actor)) return fail('NOT_FOUNDED');
  const order = state.shareOrders.find((o) => o.id === orderId);
  if (!order) return fail('UNKNOWN_ID');
  if (order.companyId !== actor) return fail('NOT_OWNED');
  closeShareOrder(state, order);
  return OK;
}

/** Sells new shares at market, at most 20% of those outstanding each calendar month. */
export function issueShares(state: GameState, qty: number, actor: CompanyId): CommandResult {
  if (!activeCompany(state, actor)) return fail('NOT_FOUNDED');
  const l = listingOf(state, actor);
  if (!l) return fail('UNKNOWN_ID');
  if (!Number.isSafeInteger(qty) || qty <= 0) return fail('INVALID_ORDER');
  if (l.issuedThisMonth + qty > Math.floor(SHARES.maxIssuePerMonth * l.outstanding)) {
    return fail('ISSUE_LIMIT');
  }
  l.issuedThisMonth += qty;
  state.shareOrders.push({
    id: newId(state),
    companyId: actor,
    target: actor,
    side: 'sell',
    kind: 'market',
    qty,
    filled: 0,
    limitCents: null,
    escrowShares: qty,
    escrowCents: 0,
    issue: true,
  });
  return OK;
}

export function setDividendRatio(state: GameState, ratio: number, actor: CompanyId): CommandResult {
  const c = activeCompany(state, actor);
  if (!c) return fail('NOT_FOUNDED');
  const l = listingOf(state, actor);
  const steps = ratio / 0.05;
  if (!l || !(ratio >= 0 && ratio <= 1) || Math.abs(steps - Math.round(steps)) > 1e-9) {
    return fail('INVALID_ORDER');
  }
  l.dividendRatio = Math.round(steps) / 20;
  return OK;
}

/** Moves cash, shares and the books for one fill at price p. */
function settle(state: GameState, o: ShareOrder, qty: number, p: number, events: SimEvent[]): void {
  const cents = qty * p;
  const listing = listingOf(state, o.target)!;
  o.filled += qty;
  if (o.side === 'buy') {
    if (!transfer(state.ledger, `escrow:${o.id}`, 'world', cents)) {
      throw new Error(`share order ${o.id} cannot pay ${cents} cents`);
    }
    o.escrowCents -= cents;
    if (o.target === o.companyId) {
      listing.treasury += qty;
      recordCashOut(state, o.companyId, cents, { to: 'equity', account: 'treasury' }, 'financing');
    } else {
      let h = holdingOf(state, o.companyId, o.target);
      if (!h)
        state.holdings.push(
          (h = { holder: o.companyId, companyId: o.target, shares: 0, costCents: 0 }),
        );
      h.shares += qty;
      h.costCents += cents;
      recordCashOut(state, o.companyId, cents, { to: 'asset' }, 'investing');
    }
  } else {
    o.escrowShares -= qty;
    if (o.issue) {
      listing.outstanding += qty;
      cashIn(state, o.companyId, cents, { to: 'equity', account: 'shareCapital' }, 'financing');
    } else {
      const h = holdingOf(state, o.companyId, o.target)!;
      const cost = qty >= h.shares ? h.costCents : Math.round((h.costCents * qty) / h.shares);
      h.shares -= qty;
      h.costCents -= cost;
      if (h.shares === 0) state.holdings = state.holdings.filter((x) => x !== h);
      cashIn(state, o.companyId, cents, { to: 'asset' }, 'investing');
      recognize(state, o.companyId, cents - cost);
    }
  }
  events.push({
    t: 'shareTrade',
    orderId: o.id,
    companyId: o.companyId,
    target: o.target,
    side: o.side,
    qty,
    cents,
  });
}

/** Emits a disclosure the first time a holder reaches 20% of a company. */
function disclose(state: GameState, events: SimEvent[]): void {
  for (const h of state.holdings) {
    const l = listingOf(state, h.companyId);
    if (!l) continue;
    const pct = h.shares / l.outstanding;
    if (pct >= SHARES.disclosureStake && !h.disclosed) {
      h.disclosed = true;
      events.push({ t: 'stakeDisclosed', holder: h.holder, companyId: h.companyId, pct });
    } else if (pct < SHARES.disclosureStake) {
      h.disclosed = false;
    }
  }
}

function available(o: ShareOrder, p: number): number {
  const left = o.qty - o.filled;
  if (o.side === 'sell') {
    return o.limitCents !== null && o.limitCents > p ? 0 : Math.min(left, o.escrowShares);
  }
  if (o.limitCents !== null && o.limitCents < p) return 0;
  return Math.min(left, Math.floor(o.escrowCents / p));
}

function clearListing(state: GameState, l: Listing, ctx: StepContext): void {
  const noise = createRng(deriveSeed(state.seed, `shares:${l.companyId}:${state.tick}`)).normal();
  l.sentiment = Math.max(
    -1,
    Math.min(1, VALUATION.sentimentDecay * l.sentiment + VALUATION.sentimentSigma * noise),
  );
  l.fvCents = fundamentalValueCents(state, l.companyId);
  const fv = l.fvCents;
  const turnover = SHARES.npcTurnoverPerHour * floatShares(state, l.companyId);
  const e = SHARES.elasticity;
  const npcNet = (p: number) => turnover * ((p / fv) ** -e - (p / fv) ** e);
  const orders = state.shareOrders.filter((o) => o.target === l.companyId);
  const book: BookOrder[] = orders.map((o) => ({
    id: o.id,
    side: o.side,
    limitCents: o.limitCents,
    available: (p: number) => available(o, p),
  }));
  const lo = Math.max(1, Math.round(fv / SHARES.boundsFactor));
  const hi = Math.round(fv * SHARES.boundsFactor);
  const { priceCents, fills } = clearBook(npcNet, lo, hi, book);
  for (const f of fills)
    settle(
      state,
      orders.find((o) => o.id === f.orderId)!,
      f.qty,
      priceCents,
      ctx.events,
    );
  l.priceCents = priceCents;
  l.history.push(priceCents);
  if (l.history.length > HISTORY_HOURS) l.history.splice(0, l.history.length - HISTORY_HOURS);
  for (const o of orders) {
    if (o.kind === 'market' || o.filled >= o.qty) closeShareOrder(state, o);
  }
}

/** Each game hour every listing clears once, after the goods market. */
export const sharesSystem: System = {
  id: 'shares',
  step(state, ctx) {
    if (state.tick % 60 !== 0) return;
    for (const l of state.listings) clearListing(state, l, ctx);
    disclose(state, ctx.events);
  },
};

// Dividends go first at each close, before the rating review; the month's issue limit resets.
CLOSE_HOOKS.unshift((state, co, events) => {
  const l = listingOf(state, co);
  if (!l) return;
  l.issuedThisMonth = 0;
  const books = companyOf(state, co)!.books;
  const income = netIncome(books.period);
  const shares = sharesInIssue(l);
  if (income <= 0 || l.dividendRatio === 0 || shares <= 0) return;
  const perShare = Math.floor(Math.floor(income * l.dividendRatio) / shares);
  const total = perShare * shares;
  if (perShare <= 0 || balance(state.ledger, cashAccount(co)) < total) return;
  cashOut(state, co, total, { to: 'equity', account: 'retained' }, 'financing');
  for (const h of state.holdings) {
    if (h.companyId !== co || h.shares === 0) continue;
    cashIn(state, h.holder, perShare * h.shares, { to: 'revenue', line: 'other' }, 'operating');
  }
  events.push({ t: 'dividendPaid', companyId: co, perShareCents: perShare });
  shockSentiment(state, co, VALUATION.dividendShock);
});

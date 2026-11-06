import { AUCTION } from '../data/auctions';
import { ownSection } from './build/sections';
import { fail, OK, type CommandResult } from './commands';
import {
  activeCompany,
  changeReputation,
  companyOf,
  sectionOwner,
  type CompanyId,
} from './companies';
import type { System } from './engine';
import type { SimEvent } from './events';
import { cashOut } from './finance/books';
import { payDue } from './finance/credit';
import { createRng, deriveSeed } from './rng';
import { newId, type GameState } from './state';
import { worldOf } from './world/luna';

export type Lot =
  | { kind: 'section'; sectionId: number }
  | { kind: 'assets'; sectionId: number; fromCompanyId: CompanyId };

export interface Bid {
  companyId: CompanyId;
  amountCents: number;
  score: number;
  tick: number;
}

export interface Auction {
  id: number;
  lot: Lot;
  openedBy: CompanyId | null;
  openTick: number;
  endTick: number;
  reserveCents: number;
  bids: Bid[];
  proxies: { companyId: CompanyId; ceilingCents: number }[];
  status: 'open' | 'won' | 'unsold';
  winner: CompanyId | null;
  priceCents: number | null;
}

/** What a bid counts for: its amount times a reputation bonus (spec 7.8). */
export const bidScore = (amountCents: number, reputation: number): number =>
  amountCents * (1 + reputation / 200);

const reputationOf = (state: GameState, co: CompanyId) =>
  companyOf(state, co)?.reputation.luna ?? 0;

/** The leading bid: the highest score, the earlier bid on a tie. */
export function leadingBid(a: Auction): Bid | undefined {
  let best: Bid | undefined;
  for (const b of a.bids) if (!best || b.score > best.score) best = b;
  return best;
}

/** The smallest amount that leads for a company: the reserve, or the leader's score plus a step. */
export function minBidCents(state: GameState, a: Auction, co: CompanyId): number {
  const lead = leadingBid(a);
  if (!lead) return a.reserveCents;
  const need = Math.max(
    lead.score + AUCTION.minIncrementCents,
    lead.score * (1 + AUCTION.minIncrementPct),
  );
  return Math.ceil(need / (1 + reputationOf(state, co) / 200));
}

const isOpenOn = (state: GameState, sectionId: number) =>
  state.auctions.some((a) => a.status === 'open' && a.lot.sectionId === sectionId);

/** Opens a lot; C11 opens company-assets lots with it too. */
export function openLot(
  state: GameState,
  lot: Lot,
  openedBy: CompanyId | null,
  reserveCents: number,
  events: SimEvent[],
): Auction {
  const auction: Auction = {
    id: newId(state),
    lot,
    openedBy,
    openTick: state.tick,
    endTick: state.tick + AUCTION.durationTicks,
    reserveCents,
    bids: [],
    proxies: [],
    status: 'open',
    winner: null,
    priceCents: null,
  };
  state.auctions.push(auction);
  events.push({
    t: 'auctionOpened',
    auctionId: auction.id,
    sectionId: lot.sectionId,
    companyId: openedBy,
  });
  return auction;
}

function bid(
  state: GameState,
  a: Auction,
  co: CompanyId,
  amountCents: number,
  events: SimEvent[],
): void {
  a.bids.push({
    companyId: co,
    amountCents,
    score: bidScore(amountCents, reputationOf(state, co)),
    tick: state.tick,
  });
  // Soft close: a late bid gives everyone 30 more ticks, never past the longest run.
  if (state.tick >= a.endTick - AUCTION.softCloseTicks) {
    a.endTick = Math.min(
      state.tick + AUCTION.softCloseTicks,
      a.openTick + AUCTION.maxDurationTicks,
    );
  }
  events.push({ t: 'bidPlaced', auctionId: a.id, companyId: co, amountCents });
}

/** Proxies bid the minimum for their companies, in id order, until none can. */
function resolveProxies(state: GameState, a: Auction, events: SimEvent[]): void {
  const proxies = [...a.proxies].sort((x, y) => x.companyId - y.companyId);
  for (let round = 0; round < 50; round++) {
    let changed = false;
    for (const p of proxies) {
      if (leadingBid(a)?.companyId === p.companyId) continue;
      const need = minBidCents(state, a, p.companyId);
      if (need > p.ceilingCents) continue;
      bid(state, a, p.companyId, need, events);
      changed = true;
    }
    if (!changed) return;
  }
}

export function openAuction(state: GameState, sectionId: number, actor: CompanyId): CommandResult {
  if (!activeCompany(state, actor)) return fail('NOT_FOUNDED');
  if (!worldOf(state).sections[sectionId]) return fail('UNKNOWN_ID');
  if (sectionOwner(state, sectionId) !== null || isOpenOn(state, sectionId)) {
    return fail('NOT_FOR_SALE');
  }
  const open = state.auctions.filter((a) => a.status === 'open');
  if (
    open.length >= AUCTION.maxOpenLots ||
    open.filter((a) => a.openedBy === actor).length >= AUCTION.maxOpenedPerCompany
  ) {
    return fail('AUCTION_LIMIT');
  }
  if (
    !cashOut(state, actor, AUCTION.listingFeeCents, { to: 'expense', line: 'fees' }, 'operating')
  ) {
    return fail('INSUFFICIENT_CASH');
  }
  openLot(state, { kind: 'section', sectionId }, actor, AUCTION.reserveCents, state.pendingEvents);
  return OK;
}

function biddable(state: GameState, auctionId: number, actor: CompanyId): Auction | CommandResult {
  if (!activeCompany(state, actor)) return fail('NOT_FOUNDED');
  const a = state.auctions.find((x) => x.id === auctionId);
  if (!a) return fail('UNKNOWN_ID');
  if (a.status !== 'open') return fail('AUCTION_CLOSED');
  if (reputationOf(state, actor) < AUCTION.minReputation) return fail('LOW_REPUTATION');
  return a;
}

export function placeBid(
  state: GameState,
  auctionId: number,
  amountCents: number,
  actor: CompanyId,
): CommandResult {
  const a = biddable(state, auctionId, actor);
  if (!('lot' in a)) return a;
  // A leader cannot bid against itself.
  if (leadingBid(a)?.companyId === actor) return fail('BID_TOO_LOW');
  if (!Number.isSafeInteger(amountCents) || amountCents < minBidCents(state, a, actor)) {
    return fail('BID_TOO_LOW');
  }
  bid(state, a, actor, amountCents, state.pendingEvents);
  resolveProxies(state, a, state.pendingEvents);
  return OK;
}

export function setProxy(
  state: GameState,
  auctionId: number,
  ceilingCents: number | null,
  actor: CompanyId,
): CommandResult {
  const a = biddable(state, auctionId, actor);
  if (!('lot' in a)) return a;
  a.proxies = a.proxies.filter((p) => p.companyId !== actor);
  if (ceilingCents !== null) {
    if (!Number.isSafeInteger(ceilingCents) || ceilingCents <= 0) return fail('INVALID_ORDER');
    a.proxies.push({ companyId: actor, ceilingCents });
  }
  resolveProxies(state, a, state.pendingEvents);
  return OK;
}

/** The leader pays, else the next company in line, each at its own best bid. */
function settle(state: GameState, a: Auction, events: SimEvent[]): void {
  // Sold elsewhere meanwhile (the land office, until C16 closes it): nothing left to sell.
  if (a.lot.kind === 'section' && sectionOwner(state, a.lot.sectionId) !== null) {
    a.status = 'unsold';
    events.push({ t: 'auctionUnsold', auctionId: a.id, sectionId: a.lot.sectionId });
    return;
  }
  const best = new Map<CompanyId, Bid>();
  for (const b of a.bids) {
    const seen = best.get(b.companyId);
    if (!seen || b.score > seen.score) best.set(b.companyId, b);
  }
  const ranked = [...best.values()].sort((x, y) => y.score - x.score || x.tick - y.tick);
  for (const b of ranked) {
    if (!activeCompany(state, b.companyId)) continue;
    if (!payDue(state, b.companyId, b.amountCents, { to: 'asset' }, 'investing')) {
      changeReputation(state, b.companyId, -AUCTION.bidDefaultRep);
      events.push({ t: 'bidDefaulted', auctionId: a.id, companyId: b.companyId });
      continue;
    }
    companyOf(state, b.companyId)!.books.landCents += b.amountCents;
    ownSection(state, a.lot.sectionId, b.companyId);
    a.status = 'won';
    a.winner = b.companyId;
    a.priceCents = b.amountCents;
    events.push({
      t: 'auctionWon',
      auctionId: a.id,
      companyId: b.companyId,
      sectionId: a.lot.sectionId,
      amountCents: b.amountCents,
    });
    events.push({ t: 'sectionBought', sectionId: a.lot.sectionId, companyId: b.companyId });
    return;
  }
  a.status = 'unsold';
  events.push({ t: 'auctionUnsold', auctionId: a.id, sectionId: a.lot.sectionId });
}

/** Every 12 game hours the Lunar Authority puts one section next to an owned one on auction. */
function scheduleLot(state: GameState, events: SimEvent[]): void {
  if (state.tick % (AUCTION.scheduledEveryHours * 60) !== 0) return;
  if (state.auctions.filter((a) => a.status === 'open').length >= AUCTION.maxOpenLots) return;
  const owned = new Set(state.sections.map((s) => s.id));
  if (owned.size === 0) return;
  const choices = worldOf(state).sections.filter(
    (s) => !owned.has(s.id) && !isOpenOn(state, s.id) && s.neighbors.some((n) => owned.has(n)),
  );
  if (choices.length === 0) return;
  const rng = createRng(deriveSeed(state.seed, `auctions:${state.tick}`));
  openLot(
    state,
    { kind: 'section', sectionId: rng.pick(choices).id },
    null,
    AUCTION.reserveCents,
    events,
  );
}

export const auctionsSystem: System = {
  id: 'auctions',
  step(state, ctx) {
    scheduleLot(state, ctx.events);
    for (const a of state.auctions) {
      if (a.status !== 'open') continue;
      resolveProxies(state, a, ctx.events);
      if (state.tick >= a.endTick) settle(state, a, ctx.events);
    }
    const closed = state.auctions.filter((a) => a.status !== 'open');
    if (closed.length > AUCTION.closedKept) {
      const old = new Set(closed.slice(0, closed.length - AUCTION.closedKept));
      state.auctions = state.auctions.filter((a) => !old.has(a));
    }
  },
};

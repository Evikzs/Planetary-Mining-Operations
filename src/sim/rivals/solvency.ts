import { AUCTION } from '../../data/auctions';
import { DEFAULT_GRACE_HOURS, SOLVENCY } from '../../data/finance';
import type { GoodId } from '../../data/goods';
import { openLot, withdrawBids } from '../auctions';
import { cashAccount, changeReputation, companyOf, type CompanyId } from '../companies';
import { failContract } from '../contracts/contracts';
import type { System } from '../engine';
import type { SimEvent } from '../events';
import {
  cashIn,
  cashOut,
  receiveGoods,
  recognize,
  releaseGoods,
  sectionGoods,
} from '../finance/books';
import { delist } from '../finance/shares';
import { balance } from '../ledger';
import { closeOrder } from '../market/orders';
import { removeWorkerAt } from '../people/store';
import type { GameState } from '../state';
import { foundRival, nextRivalName } from './founding';

/** Pays debts in order: overdue, the credit line, then loans oldest first. Returns what it paid. */
function payDebts(state: GameState, co: CompanyId, cents: number): number {
  const credit = companyOf(state, co)!.credit;
  let left = cents;
  const take = (owed: number) => {
    const part = Math.min(owed, left);
    left -= part;
    return part;
  };
  credit.overdueCents -= take(credit.overdueCents);
  credit.creditDrawnCents -= take(credit.creditDrawnCents);
  for (const l of state.loans) if (l.companyId === co) l.principalCents -= take(l.principalCents);
  state.loans = state.loans.filter((l) => l.principalCents > 0);
  return cents - left;
}

/** The lenders forgive what is still owed: a gain on the company's books, a loss to the world. */
function writeOffDebt(state: GameState, co: CompanyId, events: SimEvent[]): void {
  const credit = companyOf(state, co)!.credit;
  let cents = credit.overdueCents + credit.creditDrawnCents;
  for (const l of state.loans) if (l.companyId === co) cents += l.principalCents;
  if (cents === 0) return;
  credit.overdueCents = 0;
  credit.creditDrawnCents = 0;
  state.loans = state.loans.filter((l) => l.companyId !== co);
  recognize(state, co, cents);
  events.push({ t: 'debtWrittenOff', companyId: co, cents });
}

/** Puts a section's land, buildings, goods and residents up for auction, at half their book value. */
function auctionAssets(state: GameState, co: CompanyId, sectionId: number, events: SimEvent[]) {
  let book = state.sections.find((s) => s.id === sectionId)!.landCents;
  for (const b of state.buildings) if (b.sectionId === sectionId) book += b.bookCents;
  const reserve = Math.max(
    AUCTION.minIncrementCents,
    Math.round(book * SOLVENCY.assetsReserveShare),
  );
  openLot(state, { kind: 'assets', sectionId, fromCompanyId: co }, null, reserve, events);
}

/**
 * Takes a section off its owner's books: its orders there come back first, then its land,
 * buildings and goods leave at book value, which it returns with the goods.
 */
function releaseSection(state: GameState, sectionId: number) {
  const section = state.sections.find((s) => s.id === sectionId)!;
  const from = section.owner;
  for (const o of state.orders.filter((x) => x.companyId === from && x.sectionId === sectionId)) {
    closeOrder(state, o);
  }
  const goods = sectionGoods(state, new Set([sectionId]));
  let bookCents = section.landCents;
  companyOf(state, from)!.books.landCents -= section.landCents;
  section.landCents = 0;
  for (const [g, kg] of Object.entries(goods) as [GoodId, number][]) {
    bookCents += releaseGoods(state, from, g, kg, 'capitalise');
  }
  for (const b of state.buildings) {
    if (b.sectionId !== sectionId) continue;
    bookCents += b.bookCents;
    b.costCents = 0;
    b.bookCents = 0;
  }
  return { from, bookCents, goods };
}

/**
 * An assets lot sold: the winner takes the section with its buildings, goods and residents, the
 * price as land and the rest at zero cost. A seized seller's proceeds pay its debts and the rest
 * comes back to it; a bankrupt seller's lenders have already written their loss off.
 */
export function takeOverSection(
  state: GameState,
  sectionId: number,
  winner: CompanyId,
  priceCents: number,
): void {
  const { from, bookCents, goods } = releaseSection(state, sectionId);
  const proceeds = companyOf(state, from)!.status === 'bankrupt' ? 0 : priceCents;
  const paid = payDebts(state, from, proceeds);
  cashIn(state, from, proceeds - paid, { to: 'asset' }, 'investing');
  recognize(state, from, proceeds - bookCents);
  const section = state.sections.find((s) => s.id === sectionId)!;
  section.owner = winner;
  section.landCents = priceCents;
  companyOf(state, winner)!.books.landCents += priceCents;
  for (const [g, kg] of Object.entries(goods) as [GoodId, number][]) {
    receiveGoods(state, winner, g, kg, 0);
  }
  state.jobsDirty = true;
}

/** An unsold assets lot: the section goes back to the Lunar Authority and its people leave. */
export function returnSection(state: GameState, sectionId: number): void {
  const { from, bookCents } = releaseSection(state, sectionId);
  recognize(state, from, -bookCents);
  const ids = new Set(state.buildings.filter((b) => b.sectionId === sectionId).map((b) => b.id));
  const p = state.people;
  for (let i = p.count - 1; i >= 0; i--) {
    if (ids.has(p.home[i]!) || ids.has(p.job[i]!)) removeWorkerAt(p, i);
  }
  state.buildings = state.buildings.filter((b) => b.sectionId !== sectionId);
  state.belts = state.belts.filter((b) => b.sectionId !== sectionId);
  state.trips = state.trips.filter((t) => t.sectionId !== sectionId);
  delete state.buses[sectionId];
  state.sections = state.sections.filter((s) => s.id !== sectionId);
  state.jobsDirty = true;
}

/** A rival that cannot pay: everything it has open ends, and its sections go to auction. */
export function bankrupt(state: GameState, co: CompanyId, events: SimEvent[]): void {
  const c = companyOf(state, co)!;
  if (c.status === 'bankrupt') return;
  c.status = 'bankrupt';
  c.bankruptTick = state.tick;
  // Nobody pays its workers until their sections are sold; morale does the rest.
  c.payrollShortfall = true;
  events.push({ t: 'bankrupt', companyId: co });
  for (const o of state.orders.filter((x) => x.companyId === co)) closeOrder(state, o);
  delist(state, co);
  for (const k of state.contracts) {
    if (k.holder === co && k.status === 'active') failContract(state, events, k);
  }
  withdrawBids(state, co, events);
  // Its cash pays what it can; the lenders write off the rest.
  const paid = payDebts(state, co, balance(state.ledger, cashAccount(co)));
  cashOut(state, co, paid, { to: 'liability' }, 'financing');
  writeOffDebt(state, co, events);
  for (const s of state.sections) if (s.owner === co) auctionAssets(state, co, s.id, events);
}

/**
 * The player cannot go bankrupt in M2a: its sections other than the charter go to auction, and
 * once only the charter is left the rest of its debt is written off.
 */
function seize(state: GameState, co: CompanyId, events: SimEvent[]): void {
  const c = companyOf(state, co)!;
  const others = state.sections.filter((s) => s.owner === co && s.id !== c.charterSectionId);
  if (others.length) {
    const onSale = new Set(
      state.auctions
        .filter((a) => a.status === 'open' && a.lot.kind === 'assets')
        .map((a) => a.lot.sectionId),
    );
    for (const s of others) if (!onSale.has(s.id)) auctionAssets(state, co, s.id, events);
    return;
  }
  writeOffDebt(state, co, events);
  changeReputation(state, co, -SOLVENCY.writeOffRepLoss);
}

/** Each game hour: seizure after 24 hours of default, and a successor 48 hours after a bankruptcy. */
export const solvencySystem: System = {
  id: 'solvency',
  step(state, ctx) {
    if (state.tick % 60 !== 0) return;
    for (const c of [...state.companies]) {
      const since = c.credit.default?.sinceTick;
      if (
        c.status === 'active' &&
        since !== undefined &&
        c.credit.overdueCents > 0 &&
        state.tick - since >= DEFAULT_GRACE_HOURS * 60
      ) {
        if (c.kind === 'rival') bankrupt(state, c.id, ctx.events);
        else seize(state, c.id, ctx.events);
      }
      if (
        c.status === 'bankrupt' &&
        c.successorId === null &&
        c.bankruptTick !== null &&
        state.tick - c.bankruptTick >= SOLVENCY.replacementHours * 60
      ) {
        const fresh = foundRival(state, nextRivalName(state), c.archetype!, c.colour);
        if (!fresh) continue;
        c.successorId = fresh.id;
        ctx.events.push({ t: 'rivalFounded', companyId: fresh.id });
      }
    }
  },
};

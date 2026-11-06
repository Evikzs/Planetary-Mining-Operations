import { describe, expect, it } from 'vitest';
import { AUCTION } from '../../src/data/auctions';
import { bidScore, minBidCents, openLot } from '../../src/sim/auctions';
import { ownSection } from '../../src/sim/build/sections';
import { cashAccount, PLAYER, playerCompany, sectionOwner } from '../../src/sim/companies';
import { applyCommand, createGame, step } from '../../src/sim/engine';
import type { SimEvent } from '../../src/sim/events';
import { booksBalanced, cashOut } from '../../src/sim/finance/books';
import { balance } from '../../src/sim/ledger';
import type { GameState } from '../../src/sim/state';
import { worldOf } from '../../src/sim/world/luna';
import { addTestCompany } from '../helpers/companies';

function twoCompanies(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  const w = worldOf(s);
  const sid = w.sections.find(
    (x) => x.id !== w.foundingSectionId && !x.neighbors.includes(w.foundingSectionId),
  )!.id;
  addTestCompany(s, 1, sid);
  return s;
}
/** An unowned section, not on auction. */
function freeSection(s: GameState, skip: number[] = []): number {
  return worldOf(s).sections.find(
    (x) =>
      sectionOwner(s, x.id) === null &&
      !skip.includes(x.id) &&
      !s.auctions.some((a) => a.status === 'open' && a.lot.sectionId === x.id),
  )!.id;
}
function open(s: GameState, actor = PLAYER) {
  const sectionId = freeSection(s);
  expect(applyCommand(s, { t: 'openAuction', sectionId }, actor)).toEqual({ ok: true });
  return s.auctions.at(-1)!;
}
function run(s: GameState, ticks: number, mode: 'fine' | 'coarse' = 'fine'): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(s, { mode }));
  return events;
}
const cash = (s: GameState, co: number) => balance(s.ledger, cashAccount(co));
const leaderOf = (a: GameState['auctions'][number]) =>
  [...a.bids].sort((x, y) => y.score - x.score || x.tick - y.tick)[0];

describe('auctions', () => {
  it('opens a lot for LM 2,000; a second lot on the same section fails with NOT_FOR_SALE', () => {
    const s = twoCompanies();
    const before = cash(s, PLAYER);
    const a = open(s);
    expect(cash(s, PLAYER)).toBe(before - AUCTION.listingFeeCents);
    expect(a).toMatchObject({
      status: 'open',
      openedBy: PLAYER,
      reserveCents: AUCTION.reserveCents,
    });
    expect(a.endTick).toBe(a.openTick + AUCTION.durationTicks);
    expect(applyCommand(s, { t: 'openAuction', sectionId: a.lot.sectionId }, 1)).toEqual({
      ok: false,
      error: 'NOT_FOR_SALE',
    });
    const owned = playerCompany(s)!.charterSectionId;
    expect(applyCommand(s, { t: 'openAuction', sectionId: owned })).toEqual({
      ok: false,
      error: 'NOT_FOR_SALE',
    });
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('a higher reputation wins with a lower amount', () => {
    const s = twoCompanies();
    s.companies[1]!.reputation = { group: 60, luna: 60 };
    const a = open(s);
    expect(applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: 5_000_000 })).toEqual({
      ok: true,
    });
    expect(leaderOf(a)!.score).toBe(bidScore(5_000_000, 20));
    const need = minBidCents(s, a, 1);
    // A (rep 20) scores 5,500,000; B (rep 60) needs ceil(5,775,000 / 1.3).
    expect(need).toBe(Math.ceil(5_775_000 / 1.3));
    expect(need).toBeLessThan(5_000_000);
    expect(applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: need - 1 }, 1)).toEqual({
      ok: false,
      error: 'BID_TOO_LOW',
    });
    expect(applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: need }, 1)).toEqual({
      ok: true,
    });
    expect(leaderOf(a)!.companyId).toBe(1);
  });

  it('a proxy outbids by the minimum increment up to its ceiling', () => {
    const s = twoCompanies();
    const a = open(s);
    expect(applyCommand(s, { t: 'setProxy', auctionId: a.id, ceilingCents: 6_000_000 })).toEqual({
      ok: true,
    });
    // With no rival bid the proxy opens at the reserve.
    expect(leaderOf(a)).toMatchObject({ companyId: PLAYER, amountCents: AUCTION.reserveCents });
    applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: 4_000_000 }, 1);
    const lead = leaderOf(a)!;
    expect(lead.companyId).toBe(PLAYER);
    expect(lead.amountCents).toBe(minBidCentsAfter(4_000_000));
    // Past the ceiling the proxy stops.
    applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: 6_000_000 }, 1);
    expect(leaderOf(a)!.companyId).toBe(1);
  });

  it('two proxies resolve to within one increment of the lower ceiling', () => {
    const s = twoCompanies();
    const a = open(s);
    applyCommand(s, { t: 'setProxy', auctionId: a.id, ceilingCents: 8_000_000 });
    applyCommand(s, { t: 'setProxy', auctionId: a.id, ceilingCents: 7_000_000 }, 1);
    const lead = leaderOf(a)!;
    expect(lead.companyId).toBe(PLAYER);
    expect(lead.amountCents).toBeGreaterThan(7_000_000 / 1.05);
    expect(lead.amountCents).toBeLessThanOrEqual(7_000_000 * 1.05);
  });

  it('a bid in the last 30 ticks extends the end, never past 600 ticks', () => {
    const s = twoCompanies();
    const a = open(s);
    run(s, AUCTION.durationTicks - 10);
    applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: AUCTION.reserveCents });
    expect(a.endTick).toBe(s.tick + AUCTION.softCloseTicks);
    for (let i = 0; i < 40; i++) {
      run(s, AUCTION.softCloseTicks - 5);
      if (a.status !== 'open') break;
      const bidder = leaderOf(a)!.companyId === PLAYER ? 1 : PLAYER;
      applyCommand(
        s,
        { t: 'placeBid', auctionId: a.id, amountCents: minBidCents(s, a, bidder) },
        bidder,
      );
      expect(a.endTick).toBeLessThanOrEqual(a.openTick + AUCTION.maxDurationTicks);
    }
    expect(a.status).toBe('won');
  });

  it('settles once: the winner owns the section with a depot and a road net, and land is on its books', () => {
    const s = twoCompanies();
    const a = open(s);
    applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: 4_000_000 });
    const before = cash(s, PLAYER);
    const events = run(s, AUCTION.durationTicks + 5);
    expect(events.filter((e) => e.t === 'auctionWon')).toEqual([
      expect.objectContaining({
        companyId: PLAYER,
        sectionId: a.lot.sectionId,
        amountCents: 4_000_000,
      }),
    ]);
    expect(a).toMatchObject({ status: 'won', winner: PLAYER, priceCents: 4_000_000 });
    const section = s.sections.find((x) => x.id === a.lot.sectionId)!;
    expect(section.owner).toBe(PLAYER);
    expect(section.roadNet).not.toBeNull();
    expect(s.buildings.some((b) => b.sectionId === section.id && b.type === 'depot')).toBe(true);
    expect(playerCompany(s)!.books.landCents).toBe(4_000_000);
    expect(cash(s, PLAYER)).toBeLessThan(before - 3_000_000);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('a winner short of cash draws its credit line; without one the runner-up wins and the winner loses 5 reputation', () => {
    const s = twoCompanies();
    const a = open(s);
    applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: 4_000_000 }, 1);
    applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: 5_000_000 });
    // The player keeps LM 10,000 and has no credit.
    cashOut(s, PLAYER, cash(s, PLAYER) - 1_000_000, { to: 'expense', line: 'other' }, 'operating');
    playerCompany(s)!.credit.rating = 'D';
    const events = run(s, AUCTION.durationTicks + 5);
    expect(events).toContainEqual(
      expect.objectContaining({ t: 'bidDefaulted', companyId: PLAYER }),
    );
    expect(a).toMatchObject({ status: 'won', winner: 1, priceCents: 4_000_000 });
    expect(playerCompany(s)!.reputation.luna).toBe(15);
    expect(cash(s, PLAYER)).toBeGreaterThanOrEqual(0);

    const t = twoCompanies();
    const b = open(t);
    applyCommand(t, { t: 'placeBid', auctionId: b.id, amountCents: 5_000_000 });
    cashOut(t, PLAYER, cash(t, PLAYER) - 1_000_000, { to: 'expense', line: 'other' }, 'operating');
    run(t, AUCTION.durationTicks + 5);
    expect(b).toMatchObject({ status: 'won', winner: PLAYER });
    expect(playerCompany(t)!.credit.creditDrawnCents).toBeGreaterThan(0);
  });

  it('a lot on a section that changed hands meanwhile closes unsold', () => {
    const s = twoCompanies();
    const a = open(s);
    applyCommand(s, { t: 'placeBid', auctionId: a.id, amountCents: 4_000_000 }, 1);
    // The land office (until it closes) sells the same section to the player.
    ownSection(s, a.lot.sectionId, PLAYER);
    const events = run(s, AUCTION.durationTicks + 5);
    expect(a.status).toBe('unsold');
    expect(events.filter((e) => e.t === 'auctionWon')).toEqual([]);
    expect(s.sections.filter((x) => x.id === a.lot.sectionId)).toHaveLength(1);
  });

  it('coarse steps settle the same winner and price as fine ticks', () => {
    const setUp = () => {
      const s = twoCompanies();
      while (s.tick % 60 !== 0) step(s, { mode: 'fine' });
      const a = open(s);
      applyCommand(s, { t: 'setProxy', auctionId: a.id, ceilingCents: 8_000_000 });
      applyCommand(s, { t: 'setProxy', auctionId: a.id, ceilingCents: 7_000_000 }, 1);
      return { s, a };
    };
    const fine = setUp();
    run(fine.s, AUCTION.durationTicks + 60);
    const coarse = setUp();
    run(coarse.s, Math.ceil((AUCTION.durationTicks + 60) / 60), 'coarse');
    expect(coarse.a.status).toBe('won');
    expect([coarse.a.winner, coarse.a.priceCents]).toEqual([fine.a.winner, fine.a.priceCents]);
  });

  it('the Authority opens one scheduled lot every 12 game hours, at most 6 open', () => {
    const s = twoCompanies();
    const lots: SimEvent[] = [];
    const until = s.tick + 6 * 720;
    while (s.tick < until) {
      lots.push(...step(s, { mode: 'coarse' }).filter((e) => e.t === 'auctionOpened'));
    }
    expect(lots).toHaveLength(6);
    for (const e of lots) expect(e).toMatchObject({ companyId: null });
    for (const lot of s.auctions.filter((x) => x.openedBy === null)) {
      expect(lot.reserveCents).toBe(AUCTION.reserveCents);
    }
    // With 6 lots open an hour before the schedule, the schedule waits.
    while (s.tick % 720 !== 660) step(s, { mode: 'coarse' });
    while (s.auctions.filter((x) => x.status === 'open').length < AUCTION.maxOpenLots) {
      openLot(s, { kind: 'section', sectionId: freeSection(s) }, null, AUCTION.reserveCents, []);
    }
    const next = step(s, { mode: 'coarse' });
    expect(s.tick % 720).toBe(0);
    expect(next.filter((e) => e.t === 'auctionOpened')).toEqual([]);
  });
});

/** The proxy's answer to a rival's bid of `amount` at equal reputation (20). */
function minBidCentsAfter(amount: number): number {
  const score = bidScore(amount, 20);
  return Math.ceil(
    Math.max(score + AUCTION.minIncrementCents, score * (1 + AUCTION.minIncrementPct)) / 1.1,
  );
}

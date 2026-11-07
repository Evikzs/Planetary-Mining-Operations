import { describe, expect, it } from 'vitest';
import { REPLACEMENT_NAMES } from '../../../src/data/companies';
import { openLot } from '../../../src/sim/auctions';
import { cashAccount, PLAYER, type CompanyId } from '../../../src/sim/companies';
import type { Contract } from '../../../src/sim/contracts/contracts';
import { applyCommand, createGame, step, SYSTEMS } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { cashIn, cashOut, holdings, openBooks, recognize } from '../../../src/sim/finance/books';
import { payDue } from '../../../src/sim/finance/credit';
import { listingOf } from '../../../src/sim/finance/shares';
import { ownSection } from '../../../src/sim/build/sections';
import { checkInvariants } from '../../../src/sim/invariants';
import { balance } from '../../../src/sim/ledger';
import { bankrupt, takeOverSection } from '../../../src/sim/rivals/solvency';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}
function hours(s: GameState, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let h = 0; h < n; h++) events.push(...step(s, { mode: 'coarse' }));
  return events;
}
/** Runs with the rival AI off, so nobody bids but the test. */
function quiet<T>(run: () => T): T {
  const i = SYSTEMS.findIndex((x) => x.id === 'rivals');
  const ai = SYSTEMS[i]!;
  SYSTEMS[i] = { id: 'rivals', step: () => {} };
  try {
    return run();
  } finally {
    SYSTEMS[i] = ai;
  }
}
const company = (s: GameState, co: CompanyId) => s.companies.find((c) => c.id === co)!;
const charterOf = (s: GameState, co: CompanyId) => company(s, co).charterSectionId;
const cash = (s: GameState, co: CompanyId) => balance(s.ledger, cashAccount(co));
const residentsOf = (s: GameState, sectionId: number) => {
  const homes = new Set(s.buildings.filter((b) => b.sectionId === sectionId).map((b) => b.id));
  let n = 0;
  for (let i = 0; i < s.people.count; i++) if (homes.has(s.people.home[i]!)) n++;
  return n;
};
const assetsLotOn = (s: GameState, sectionId: number) =>
  s.auctions.find((a) => a.lot.kind === 'assets' && a.lot.sectionId === sectionId)!;

/** A company that missed `owed` cents `hoursAgo` game hours ago and has no cash left. */
function defaulted(s: GameState, co: CompanyId, owed: number, hoursAgo: number): void {
  const c = company(s, co);
  cashOut(s, co, cash(s, co), { to: 'expense', line: 'other' }, 'operating');
  // A cost it could not pay: owed, and on its books.
  c.credit.overdueCents += owed;
  recognize(s, co, -owed);
  c.credit.default = { sinceTick: s.tick - hoursAgo * 60 };
  c.credit.rating = 'D';
}

/** Goods every company holds, summed per good. */
function allGoods(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of s.companies) {
    for (const [g, kg] of Object.entries(holdings(s, c.id))) out[g] = (out[g] ?? 0) + kg;
  }
  return out;
}

/** Rival 1 with a buy and a sell order, an active contract and a proxy; the player owns its shares. */
function entangled(s: GameState) {
  const sid = charterOf(s, 1);
  const buy = { goodId: 'machinery', side: 'buy', kind: 'limit', qtyKg: 5000 } as const;
  expect(
    applyCommand(s, { t: 'placeOrder', ...buy, limitCents: 100_000, sectionId: sid }, 1),
  ).toEqual({ ok: true });
  const sell = { goodId: 'prefabStructures', side: 'sell', kind: 'limit', qtyKg: 10_000 } as const;
  expect(
    applyCommand(s, { t: 'placeOrder', ...sell, limitCents: 90_000_000, sectionId: sid }, 1),
  ).toEqual({ ok: true });
  const contract: Contract = {
    id: s.nextId++,
    type: 'oreDelivery',
    issuer: 'Lunar Authority',
    status: 'active',
    offeredTick: s.tick,
    deadlineTick: s.tick + 30 * 60,
    hours: 30,
    rewardCents: 3_000_000,
    repGain: 3,
    repLoss: 5,
    stages: [{ kind: 'deliver', needKg: { regolith: 30_000 }, doneKg: {} }],
    stageIndex: 0,
    plotId: null,
    asset: null,
    holder: 1,
    tenderTo: null,
  };
  s.contracts.push(contract);
  const free = worldOf(s).sections.find(
    (x) => !s.sections.some((y) => y.id === x.id) && x.id !== sid,
  )!.id;
  const lot = openLot(s, { kind: 'section', sectionId: free }, null, 3_000_000, []);
  expect(applyCommand(s, { t: 'setProxy', auctionId: lot.id, ceilingCents: 5_000_000 }, 1)).toEqual(
    { ok: true },
  );
  // The player owns 1,000 of its shares, and bids for more.
  cashOut(s, PLAYER, 500_000, { to: 'asset' }, 'investing');
  s.holdings.push({ holder: PLAYER, companyId: 1, shares: 1000, costCents: 500_000 });
  expect(
    applyCommand(s, {
      t: 'placeShareOrder',
      target: 1,
      side: 'buy',
      kind: 'limit',
      qty: 100,
      limitCents: 1,
    }),
  ).toEqual({ ok: true });
  return { contract, lot };
}

describe('solvency', () => {
  it('a rival 24 game hours in default goes bankrupt and its sections go to auction', () => {
    const s = founded();
    defaulted(s, 1, 200_000_000, 22);
    const sections = s.sections.filter((x) => x.owner === 1).map((x) => x.id);
    hours(s, 1);
    expect(company(s, 1).status).toBe('active');
    const events = hours(s, 1);
    expect(company(s, 1).status).toBe('bankrupt');
    expect(company(s, 1).bankruptTick).toBe(s.tick);
    expect(events).toContainEqual({ t: 'bankrupt', companyId: 1 });
    for (const id of sections) {
      expect(assetsLotOn(s, id)).toMatchObject({
        lot: { kind: 'assets', sectionId: id, fromCompanyId: 1 },
        openedBy: null,
        status: 'open',
      });
      // Its sections stay its own until sold.
      expect(s.sections.find((x) => x.id === id)!.owner).toBe(1);
    }
    expect(checkInvariants(s)).toEqual([]);
  });

  it('bankruptcy cancels orders with escrow back, fails contracts, withdraws bids and writes off its shares', () => {
    const s = founded();
    const { contract, lot } = entangled(s);
    const depot = s.sections.find((x) => x.id === charterOf(s, 1))!.depot;
    const prefab = depot.prefabStructures!;
    const playerCash = cash(s, PLAYER);
    const writeOffs = company(s, PLAYER).books.period.expense.writeOffs;
    const events: SimEvent[] = [];
    bankrupt(s, 1, events);
    expect(s.orders.filter((o) => o.companyId === 1)).toEqual([]);
    expect(depot.prefabStructures).toBe(prefab + 10_000);
    expect(Object.keys(s.ledger.balances).filter((k) => k.startsWith('escrow:'))).toEqual([]);
    expect(contract.status).toBe('failed');
    expect(lot.bids.some((b) => b.companyId === 1)).toBe(false);
    expect(lot.proxies.some((p) => p.companyId === 1)).toBe(false);
    expect(listingOf(s, 1)).toBeUndefined();
    expect(s.holdings.some((h) => h.companyId === 1 || h.holder === 1)).toBe(false);
    expect(s.shareOrders.some((o) => o.companyId === 1 || o.target === 1)).toBe(false);
    expect(cash(s, PLAYER)).toBe(playerCash + 100);
    expect(company(s, PLAYER).books.period.expense.writeOffs).toBe(writeOffs + 500_000);
    expect(company(s, 1).payrollShortfall).toBe(true);
    expect(events).toContainEqual({ t: 'bankrupt', companyId: 1 });
    expect(checkInvariants(s)).toEqual([]);
  });

  it('no money or goods appear or vanish through a bankruptcy', () => {
    const s = founded();
    entangled(s);
    expect(applyCommand(s, { t: 'takeLoan', amountCents: 2_000_000, months: 6 }, 1)).toEqual({
      ok: true,
    });
    defaulted(s, 1, 50_000_000, 0);
    const before = allGoods(s);
    bankrupt(s, 1, []);
    expect(allGoods(s)).toEqual(before);
    expect(checkInvariants(s)).toEqual([]);
    expect(company(s, 1).credit).toMatchObject({ overdueCents: 0, creditDrawnCents: 0 });
    expect(s.loans.some((l) => l.companyId === 1)).toBe(false);
    // Its lots run their course; books and holdings agree every hour.
    quiet(() => {
      for (let h = 0; h < 12; h++) {
        step(s, { mode: 'coarse' });
        expect(checkInvariants(s)).toEqual([]);
      }
    });
    expect(s.auctions.filter((a) => a.lot.kind === 'assets' && a.status === 'open')).toEqual([]);
  });

  it('the winner of an assets lot takes the section with its buildings, stock and residents', () => {
    const s = founded();
    const sid = charterOf(s, 1);
    bankrupt(s, 1, []);
    const section = s.sections.find((x) => x.id === sid)!;
    const depot = { ...section.depot };
    const buildings = s.buildings.filter((b) => b.sectionId === sid).map((b) => b.id);
    const residents = residentsOf(s, sid);
    const pools = structuredClone(company(s, PLAYER).books.pools);
    const land = company(s, PLAYER).books.landCents;
    // Settled by hand at LM 50,000, as the auction would.
    expect(payDue(s, PLAYER, 5_000_000, { to: 'asset' }, 'investing')).toBe(true);
    takeOverSection(s, sid, PLAYER, 5_000_000);
    expect(section.owner).toBe(PLAYER);
    expect(section.depot).toEqual(depot);
    expect(s.buildings.filter((b) => b.sectionId === sid).map((b) => b.id)).toEqual(buildings);
    for (const b of s.buildings.filter((x) => x.sectionId === sid)) {
      expect([b.costCents, b.bookCents]).toEqual([0, 0]);
    }
    expect(residentsOf(s, sid)).toBe(residents);
    expect(company(s, PLAYER).books.landCents).toBe(land + 5_000_000);
    for (const [g, kg] of Object.entries(depot)) {
      const pool = company(s, PLAYER).books.pools[g as keyof typeof depot]!;
      const had = pools[g as keyof typeof pools] ?? { kg: 0, basisCents: 0 };
      expect(pool.kg).toBe(had.kg + kg);
      expect(pool.basisCents).toBe(had.basisCents);
    }
    expect(holdings(s, 1)).toEqual({});
    expect(checkInvariants(s)).toEqual([]);

    // The same through an auction: a lone player proxy wins the next rival's charter.
    const sid2 = charterOf(s, 2);
    bankrupt(s, 2, []);
    const lot = assetsLotOn(s, sid2);
    expect(
      applyCommand(s, { t: 'setProxy', auctionId: lot.id, ceilingCents: lot.reserveCents }),
    ).toEqual({ ok: true });
    quiet(() => hours(s, 4));
    expect(lot).toMatchObject({ status: 'won', winner: PLAYER, priceCents: lot.reserveCents });
    expect(s.sections.find((x) => x.id === sid2)!.owner).toBe(PLAYER);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('an unsold assets lot returns the section to the Lunar Authority', () => {
    const s = founded();
    const sid = charterOf(s, 1);
    bankrupt(s, 1, []);
    const ids = new Set(s.buildings.filter((b) => b.sectionId === sid).map((b) => b.id));
    const writeOffs = company(s, 1).books.period.expense.writeOffs;
    const lot = assetsLotOn(s, sid);
    quiet(() => hours(s, 4));
    expect(lot.status).toBe('unsold');
    expect(s.sections.some((x) => x.id === sid)).toBe(false);
    expect(s.buildings.some((b) => ids.has(b.id))).toBe(false);
    for (let i = 0; i < s.people.count; i++) expect(ids.has(s.people.home[i]!)).toBe(false);
    expect(s.trips.some((t) => t.sectionId === sid)).toBe(false);
    expect(s.belts.some((b) => b.sectionId === sid)).toBe(false);
    expect(s.buses[sid]).toBeUndefined();
    // Its stock and buildings are written off on the bankrupt company's books.
    expect(company(s, 1).books.pools).toEqual({});
    expect(company(s, 1).books.period.expense.writeOffs).toBeGreaterThan(writeOffs);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a new rival is founded 48 game hours after a bankruptcy', () => {
    const s = founded();
    bankrupt(s, 1, []);
    const n = s.companies.length;
    hours(s, 47);
    expect(s.companies).toHaveLength(n);
    const events = hours(s, 2);
    expect(s.companies).toHaveLength(n + 1);
    const fresh = s.companies.at(-1)!;
    expect(fresh).toMatchObject({
      name: REPLACEMENT_NAMES[0],
      kind: 'rival',
      archetype: 'expander',
      colour: 'teal',
      status: 'active',
    });
    expect(fresh.id).toBe(6);
    expect(events).toContainEqual({ t: 'rivalFounded', companyId: fresh.id });
    expect(listingOf(s, fresh.id)).toBeDefined();
    expect(checkInvariants(s)).toEqual([]);
  });

  it('a cured default withdraws the seizure lots: the sections stay with the player', () => {
    const s = founded();
    const charter = charterOf(s, PLAYER);
    const next = worldOf(s).sections[charter]!.neighbors.find(
      (n) => !s.sections.some((x) => x.id === n),
    )!;
    ownSection(s, next, PLAYER);
    openBooks(s, PLAYER);
    const buildings = s.buildings.filter((b) => b.sectionId === next).length;
    defaulted(s, PLAYER, 100_000, 23);
    quiet(() => hours(s, 1));
    const lot = assetsLotOn(s, next);
    expect(lot.status).toBe('open');
    // LM 1,000 comes in: the next hour pays the overdue and cures the default.
    cashIn(s, PLAYER, 500_000, { to: 'revenue', line: 'other' }, 'operating');
    const events = quiet(() => hours(s, 6));
    expect(events.some((e) => e.t === 'defaultCured')).toBe(true);
    expect(lot).toMatchObject({ status: 'unsold', winner: null });
    expect(s.sections.find((x) => x.id === next)?.owner).toBe(PLAYER);
    expect(s.buildings.filter((b) => b.sectionId === next)).toHaveLength(buildings);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('the player keeps the charter section and the rest of the debt is written off', () => {
    const s = founded();
    const charter = charterOf(s, PLAYER);
    // A second section, and a loan.
    const next = worldOf(s).sections[charter]!.neighbors.find(
      (n) => !s.sections.some((x) => x.id === n),
    )!;
    ownSection(s, next, PLAYER);
    openBooks(s, PLAYER);
    expect(applyCommand(s, { t: 'takeLoan', amountCents: 5_000_000, months: 3 })).toEqual({
      ok: true,
    });
    defaulted(s, PLAYER, 200_000_000, 23);
    const rep = company(s, PLAYER).reputation.luna;
    const events = quiet(() => hours(s, 8));
    // The second section went to auction; nobody bid, so it is the Authority's again.
    expect(assetsLotOn(s, next)).toMatchObject({ status: 'unsold', openedBy: null });
    expect(s.sections.filter((x) => x.owner === PLAYER).map((x) => x.id)).toEqual([charter]);
    const off = events.find((e) => e.t === 'debtWrittenOff');
    expect(off).toMatchObject({ t: 'debtWrittenOff', companyId: PLAYER });
    // At least the loan: forced sales pay some of the overdue first.
    expect(off!.t === 'debtWrittenOff' && off!.cents).toBeGreaterThan(5_000_000);
    const player = company(s, PLAYER);
    expect(s.loans.some((l) => l.companyId === PLAYER)).toBe(false);
    expect(player.credit).toMatchObject({
      overdueCents: 0,
      creditDrawnCents: 0,
      default: null,
      rating: 'D',
      dRatingCloses: 3,
    });
    expect(player.reputation.luna).toBe(rep - 20);
    expect(player.status).toBe('active');
    expect(checkInvariants(s)).toEqual([]);
  });
});

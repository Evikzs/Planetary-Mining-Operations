import { describe, expect, it } from 'vitest';
import { GOODS, type GoodId } from '../../../src/data/goods';
import { sectionState } from '../../../src/sim/build/sections';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { checkInvariants } from '../../../src/sim/invariants';
import { balance } from '../../../src/sim/ledger';
import { clear } from '../../../src/sim/market/clearing';
import { quote } from '../../../src/sim/market/market';
import type { GoodMarket, Order } from '../../../src/sim/market/orders';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const base = (g: GoodId) => GOODS[g].basePriceCents;
const fresh = (g: GoodId): GoodMarket => ({
  goodId: g,
  pRefCents: base(g),
  lastCents: base(g),
  history: [],
  volume24hKg: 0,
});

let nextId = 1;
function order(o: Partial<Order> & Pick<Order, 'goodId' | 'side' | 'qtyKg'>): Order {
  return {
    id: nextId++,
    kind: 'market',
    filledKg: 0,
    limitCents: null,
    sectionId: home,
    dailyQtyKg: null,
    escrowKg: o.side === 'sell' ? o.qtyKg : 0,
    escrowCents: o.side === 'buy' ? (5 * base(o.goodId) * o.qtyKg) / 1000 : 0,
    ...o,
  };
}

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function run(s: GameState, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(s, { mode: 'fine' }));
  return events;
}

type Trade = Extract<SimEvent, { t: 'trade' }>;
const trades = (events: SimEvent[]) => events.filter((e): e is Trade => e.t === 'trade');
const near = (actual: number, expected: number, tolerance: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

describe('clearing', () => {
  const ilmenite = GOODS.ilmenite;
  const hourlyKg = ilmenite.npc.volumeTph * 1000;

  it('clears at pRef with only NPC curves (±0.1%)', () => {
    const { priceCents, fills } = clear(ilmenite, fresh('ilmenite'), 1, []);
    near(priceCents / base('ilmenite'), 1, 0.001);
    expect(fills).toEqual([]);
  });

  it('selling 0.5×V of a raw good clears at 0.697×pRef (±0.002)', () => {
    const sell = order({ goodId: 'ilmenite', side: 'sell', qtyKg: hourlyKg / 2 });
    const { priceCents, fills } = clear(ilmenite, fresh('ilmenite'), 1, [sell]);
    near(priceCents / base('ilmenite'), 0.697, 0.002);
    expect(fills).toEqual([{ orderId: sell.id, kg: hourlyKg / 2 }]);
  });

  it('buying 0.5×V clears at 1.498×pRef (±0.002)', () => {
    const buy = order({ goodId: 'ilmenite', side: 'buy', qtyKg: hourlyKg / 2 });
    const { priceCents, fills } = clear(ilmenite, fresh('ilmenite'), 1, [buy]);
    near(priceCents / base('ilmenite'), 1.498, 0.002);
    expect(fills).toEqual([{ orderId: buy.id, kg: hourlyKg / 2 }]);
  });

  it('colony ×2 raises the curve-only clearing price to 1.532×pRef (±0.002)', () => {
    const { priceCents } = clear(ilmenite, fresh('ilmenite'), 2 ** 0.8, []);
    near(priceCents / base('ilmenite'), 1.532, 0.002);
  });

  it('a limit sell above the clearing price does not fill', () => {
    const sell = order({
      goodId: 'ilmenite',
      side: 'sell',
      kind: 'limit',
      qtyKg: 5000,
      limitCents: Math.round(base('ilmenite') * 1.2),
    });
    const { priceCents, fills } = clear(ilmenite, fresh('ilmenite'), 1, [sell]);
    near(priceCents / base('ilmenite'), 1, 0.001);
    expect(fills).toEqual([]);
  });
});

describe('market', () => {
  it('selling 100x hourly volume clears at the lower bound and returns the rest', () => {
    const s = founded();
    const depot = sectionState(s, home)!.depot;
    depot.helium3 = 5000;
    expect(
      applyCommand(s, {
        t: 'placeOrder',
        goodId: 'helium3',
        side: 'sell',
        kind: 'market',
        qtyKg: 5000,
        sectionId: home,
      }),
    ).toEqual({ ok: true });
    expect(depot.helium3 ?? 0).toBe(0);
    const [trade] = trades(run(s, 60));
    expect(s.market.helium3.lastCents).toBe(base('helium3') / 20);
    near(trade!.kg / 4461, 1, 0.005);
    expect(trade!.cents).toBe(Math.round((trade!.kg * s.market.helium3.lastCents) / 1000));
    expect(depot.helium3).toBe(5000 - trade!.kg);
    expect(s.orders).toHaveLength(0);
    expect(Number.isFinite(s.market.helium3.pRefCents)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('conserves money and goods between player and world', () => {
    const s = founded();
    // No residents: no wages or meals move money or goods while the market runs.
    const quarters = s.buildings.find((b) => b.type === 'crewQuarters')!;
    applyCommand(s, { t: 'demolish', buildingId: quarters.id });
    const depot = sectionState(s, home)!.depot;
    depot.ilmenite = 20_000;
    const steel0 = depot.steel ?? 0;
    const cash0 = balance(s.ledger, 'player');
    const place = (side: 'buy' | 'sell', goodId: GoodId, kind: 'market' | 'limit', kg: number) =>
      applyCommand(s, {
        t: 'placeOrder',
        goodId,
        side,
        kind,
        qtyKg: kg,
        limitCents:
          kind === 'limit' ? Math.round(base(goodId) * (side === 'buy' ? 2 : 0.95)) : undefined,
        sectionId: home,
      });
    expect(place('sell', 'ilmenite', 'market', 10_000)).toEqual({ ok: true });
    expect(place('sell', 'ilmenite', 'limit', 5_000)).toEqual({ ok: true });
    expect(place('buy', 'steel', 'limit', 2_000)).toEqual({ ok: true });
    const done = trades(run(s, 180));
    expect(done.length).toBeGreaterThan(0);
    const cents = (side: 'buy' | 'sell') =>
      done.filter((t) => t.side === side).reduce((sum, t) => sum + t.cents, 0);
    const escrowCents = s.orders.reduce((sum, o) => sum + balance(s.ledger, `escrow:${o.id}`), 0);
    expect(balance(s.ledger, 'player') + escrowCents).toBe(cash0 + cents('sell') - cents('buy'));
    const escrowKg = s.orders
      .filter((o) => o.goodId === 'ilmenite')
      .reduce((sum, o) => sum + o.escrowKg, 0);
    expect((depot.ilmenite ?? 0) + escrowKg + (s.stats.soldKg.ilmenite ?? 0)).toBe(20_000);
    expect((depot.steel ?? 0) - steel0).toBe(s.stats.boughtKg.steel ?? 0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('cancel returns escrow; standing orders re-arm daily', () => {
    const s = founded();
    const depot = sectionState(s, home)!.depot;
    depot.ilmenite = 10_000;
    const cash0 = balance(s.ledger, 'player');
    applyCommand(s, {
      t: 'placeOrder',
      goodId: 'ilmenite',
      side: 'buy',
      kind: 'limit',
      qtyKg: 1000,
      limitCents: 3000,
      sectionId: home,
    });
    expect(balance(s.ledger, 'player')).toBe(cash0 - 3000);
    expect(applyCommand(s, { t: 'cancelOrder', orderId: s.orders[0]!.id })).toEqual({ ok: true });
    expect(balance(s.ledger, 'player')).toBe(cash0);
    expect(s.orders).toHaveLength(0);
    expect(applyCommand(s, { t: 'cancelOrder', orderId: 12_345 })).toEqual({
      ok: false,
      error: 'UNKNOWN_ID',
    });

    applyCommand(s, {
      t: 'placeOrder',
      goodId: 'ilmenite',
      side: 'sell',
      kind: 'standing',
      qtyKg: 500,
      limitCents: base('ilmenite') / 2,
      sectionId: home,
    });
    expect(depot.ilmenite).toBe(9_500);
    run(s, 1139); // to 23:59
    expect(s.stats.soldKg.ilmenite).toBe(500);
    run(s, 1); // 00:00: re-armed from the depot and sold again
    expect(s.stats.soldKg.ilmenite).toBe(1000);
    expect(depot.ilmenite).toBe(9_000);
    expect(s.orders).toHaveLength(1);
  });

  it('placeOrder rejects bad amounts, missing stock or cash, a full depot and unowned depots', () => {
    const s = founded();
    const place = (o: Record<string, unknown>) =>
      applyCommand(s, {
        t: 'placeOrder',
        goodId: 'ilmenite',
        side: 'sell',
        kind: 'market',
        qtyKg: 1000,
        sectionId: home,
        ...o,
      });
    const error = (e: string) => ({ ok: false, error: e });
    expect(place({ qtyKg: 0 })).toEqual(error('INVALID_ORDER'));
    expect(place({ qtyKg: 1.5 })).toEqual(error('INVALID_ORDER'));
    expect(place({ kind: 'limit' })).toEqual(error('INVALID_ORDER'));
    expect(place({})).toEqual(error('INSUFFICIENT_STOCK'));
    expect(place({ side: 'buy', goodId: 'helium3', qtyKg: 2000 })).toEqual(
      error('INSUFFICIENT_CASH'),
    );
    expect(place({ side: 'buy', goodId: 'regolith', qtyKg: 4_000_000 })).toEqual(
      error('STORAGE_FULL'),
    );
    const other = world.sections[home]!.neighbors[0]!;
    expect(place({ sectionId: other })).toEqual(error('NOT_OWNED'));
    expect(s.orders).toHaveLength(0);
  });

  it('quote estimates a market order without placing it', () => {
    const s = founded();
    const hourlyKg = GOODS.ilmenite.npc.volumeTph * 1000;
    const q = quote(s, 'ilmenite', 'sell', hourlyKg / 2);
    near(q.priceCents / s.market.ilmenite.pRefCents, 0.697, 0.002);
    expect(q.filledKg).toBe(hourlyKg / 2);
    expect(s.orders).toHaveLength(0);
  });

  it('a crash past 30% in 24 hours reports one priceMove', () => {
    const s = founded();
    for (let h = 0; h < 24; h++) step(s, { mode: 'coarse' });
    const depot = sectionState(s, home)!.depot;
    depot.regolith = 240_000;
    applyCommand(s, {
      t: 'placeOrder',
      goodId: 'regolith',
      side: 'sell',
      kind: 'market',
      qtyKg: 240_000,
      sectionId: home,
    });
    const events = [...step(s, { mode: 'coarse' }), ...step(s, { mode: 'coarse' })];
    const moves = events.filter((e) => e.t === 'priceMove');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ goodId: 'regolith' });
    expect((moves[0] as Extract<SimEvent, { t: 'priceMove' }>).pct24h).toBeLessThan(-0.3);
  });

  it('pRef returns within 10% of base within 72 game hours after a 30% shock', () => {
    const s = founded();
    s.market.ilmenite.pRefCents = 1.3 * base('ilmenite');
    for (let h = 0; h < 72; h++) step(s, { mode: 'coarse' });
    near(s.market.ilmenite.pRefCents / base('ilmenite'), 1, 0.1);
  });
});

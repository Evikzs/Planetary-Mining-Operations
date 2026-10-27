import { MARKET } from '../../data/balance';
import { GOOD_IDS, GOODS, type GoodDef, type GoodId } from '../../data/goods';
import { sectionState } from '../build/sections';
import { minuteOfDay } from '../clock';
import type { StepContext, System } from '../engine';
import { add, take } from '../inventory';
import { balance, transfer } from '../ledger';
import type { GameState } from '../state';
import { worldOf } from '../world/luna';
import { clear, type Fill } from './clearing';
import { colonyScale, npcDemandTph, npcSupplyTph } from './curves';
import { buyEscrowCents, closeOrder, type GoodMarket, type Order } from './orders';

/** The price and fill a market order of this size would get at the next clearing, as things stand. */
export function quote(
  state: GameState,
  goodId: GoodId,
  side: Order['side'],
  kg: number,
): { priceCents: number; filledKg: number } {
  const probe: Order = {
    id: -1,
    goodId,
    side,
    kind: 'market',
    qtyKg: kg,
    filledKg: 0,
    limitCents: null,
    sectionId: -1,
    dailyQtyKg: null,
    escrowKg: side === 'sell' ? kg : 0,
    escrowCents: side === 'buy' ? Number.MAX_SAFE_INTEGER : 0,
  };
  const { priceCents, fills } = clear(
    GOODS[goodId],
    state.market[goodId],
    colonyScale(state.colonyPop),
    [...state.orders, probe],
  );
  return { priceCents, filledKg: fills.find((f) => f.orderId === -1)?.kg ?? 0 };
}

/** At 00:00 standing orders start a new day, topping up what they hold from depot and cash. */
function rearmStanding(state: GameState): void {
  for (const o of state.orders) {
    if (o.kind !== 'standing') continue;
    o.filledKg = 0;
    const depot = sectionState(state, o.sectionId)?.depot;
    if (o.side === 'sell' && depot) {
      const top = Math.min(o.qtyKg - o.escrowKg, depot[o.goodId] ?? 0);
      if (top > 0 && take(depot, o.goodId, top)) o.escrowKg += top;
    } else if (o.side === 'buy') {
      const top = Math.min(
        buyEscrowCents(state, o) - o.escrowCents,
        balance(state.ledger, 'player'),
      );
      if (top > 0 && transfer(state.ledger, 'player', `escrow:${o.id}`, top)) o.escrowCents += top;
    }
  }
}

/** Moves money and goods for each fill at the uniform price. Returns the kg bought and sold. */
function settle(
  state: GameState,
  ctx: StepContext,
  fills: Fill[],
  p: number,
): { bought: number; sold: number } {
  let bought = 0;
  let sold = 0;
  for (const f of fills) {
    const o = state.orders.find((x) => x.id === f.orderId)!;
    const cents = Math.round((f.kg * p) / 1000);
    o.filledKg += f.kg;
    if (o.side === 'sell') {
      o.escrowKg -= f.kg;
      transfer(state.ledger, 'world', 'player', cents);
      state.stats.soldKg[o.goodId] = (state.stats.soldKg[o.goodId] ?? 0) + f.kg;
      state.stats.incomeCents += cents;
      const plotId = worldOf(state).sections[o.sectionId]?.hubPlotId ?? null;
      ctx.events.push({ t: 'income', plotId, cents, source: 'trade' });
      sold += f.kg;
    } else {
      if (!transfer(state.ledger, `escrow:${o.id}`, 'world', cents)) {
        throw new Error(`order ${o.id} cannot pay ${cents} cents`);
      }
      o.escrowCents -= cents;
      const depot = sectionState(state, o.sectionId)?.depot;
      if (depot) add(depot, o.goodId, f.kg);
      state.stats.boughtKg[o.goodId] = (state.stats.boughtKg[o.goodId] ?? 0) + f.kg;
      bought += f.kg;
    }
    ctx.events.push({ t: 'trade', orderId: o.id, goodId: o.goodId, side: o.side, kg: f.kg, cents });
  }
  return { bought, sold };
}

/** Updates price history, volume and the curve centre after a clearing. */
function record(
  state: GameState,
  ctx: StepContext,
  g: GoodDef,
  m: GoodMarket,
  p: number,
  hourKg: number,
): void {
  m.lastCents = p;
  m.history.push(p);
  if (m.history.length > MARKET.historyHours) m.history.shift();
  m.volume24hKg += hourKg - m.volume24hKg / 24;
  const target = g.basePriceCents * colonyScale(state.colonyPop) ** 0.5;
  m.pRefCents = Math.exp(
    Math.log(m.pRefCents) +
      MARKET.momentum * Math.log(p / m.pRefCents) -
      MARKET.meanReversion * Math.log(m.pRefCents / target) +
      MARKET.noiseSigma * ctx.rng.normal(),
  );
  const h = m.history;
  const change = (back: number) =>
    h.length > 24 + back ? h[h.length - 1 - back]! / h[h.length - 25 - back]! - 1 : 0;
  if (Math.abs(change(0)) > 0.3 && Math.abs(change(1)) <= 0.3) {
    ctx.events.push({ t: 'priceMove', goodId: g.id, pct24h: change(0) });
  }
}

export const marketSystem: System = {
  id: 'market',
  step(state, ctx) {
    if (state.tick % 60 !== 0) return;
    if (minuteOfDay(state.tick) === 0) rearmStanding(state);
    const scale = colonyScale(state.colonyPop);
    for (const goodId of GOOD_IDS) {
      const g = GOODS[goodId];
      const m = state.market[goodId];
      const { priceCents, fills } = clear(g, m, scale, state.orders);
      const { bought, sold } = settle(state, ctx, fills, priceCents);
      const demandKg = npcDemandTph(g, priceCents, m.pRefCents, scale) * 1000 + bought;
      const supplyKg = npcSupplyTph(g, priceCents, m.pRefCents) * 1000 + sold;
      record(state, ctx, g, m, priceCents, Math.min(demandKg, supplyKg));
    }
    // Market orders live for one clearing; filled limit orders leave the book.
    for (const o of [...state.orders]) {
      if (o.kind === 'market' || (o.kind === 'limit' && o.filledKg >= o.qtyKg))
        closeOrder(state, o);
    }
  },
};

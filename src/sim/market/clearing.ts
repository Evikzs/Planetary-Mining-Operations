import { MARKET } from '../../data/balance';
import type { GoodDef } from '../../data/goods';
import { npcDemandTph, npcSupplyTph } from './curves';
import type { GoodMarket, Order } from './orders';

export interface Fill {
  orderId: number;
  kg: number;
}

/** What an order can trade at price p, in kg: nothing past its limit, nothing it cannot pay for. */
export function available(o: Order, p: number): number {
  const left = o.qtyKg - o.filledKg;
  if (o.side === 'sell')
    return o.limitCents !== null && o.limitCents > p ? 0 : Math.min(left, o.escrowKg);
  if (o.limitCents !== null && o.limitCents < p) return 0;
  return Math.min(left, Math.floor((o.escrowCents * 1000) / p));
}

/** An order as the clearing sees it: a side, a limit, and what it can trade at price p. */
export interface BookOrder {
  id: number;
  side: 'buy' | 'sell';
  limitCents: number | null;
  available(p: number): number;
}

export interface BookFill {
  orderId: number;
  qty: number;
}

/** Better-priced orders first; orders exactly at the price share what is left, pro rata. */
function allocate(orders: BookOrder[], total: number, p: number): BookFill[] {
  let left = Math.floor(total + 1e-9);
  const fills: BookFill[] = [];
  for (const group of [
    orders.filter((o) => o.limitCents !== p),
    orders.filter((o) => o.limitCents === p),
  ]) {
    const want = group.map((o) => o.available(p));
    const sum = want.reduce((a, b) => a + b, 0);
    if (sum === 0) continue;
    const qty = sum <= left ? want : want.map((w) => Math.floor((w * left) / sum));
    let rest = sum <= left ? 0 : left - qty.reduce((a, b) => a + b, 0);
    group.forEach((o, i) => {
      let q = qty[i]!;
      if (rest > 0 && q < want[i]!) {
        q++;
        rest--;
      }
      if (q > 0) fills.push({ orderId: o.id, qty: q });
      left -= q;
    });
  }
  return fills;
}

/**
 * One call auction in any unit: the uniform price in [lo, hi] where the NPC curves' net demand
 * and the book balance, and the fills at that price. At a bound or a limit-price jump, one side
 * is rationed.
 */
export function clearBook(
  npcNet: (p: number) => number,
  lo: number,
  hi: number,
  book: BookOrder[],
): { priceCents: number; fills: BookFill[] } {
  const sum = (side: BookOrder['side'], p: number) =>
    book.filter((o) => o.side === side).reduce((n, o) => n + o.available(p), 0);
  const excess = (p: number) => npcNet(p) + sum('buy', p) - sum('sell', p);
  const ration = (p: number) => {
    const buys = book.filter((o) => o.side === 'buy');
    const sells = book.filter((o) => o.side === 'sell');
    const net = npcNet(p);
    const bought = sum('buy', p);
    const sold = sum('sell', p);
    return excess(p) <= 0
      ? [
          ...allocate(buys, bought, p),
          ...allocate(sells, Math.min(sold, Math.max(0, bought + net)), p),
        ]
      : [
          ...allocate(buys, Math.min(bought, Math.max(0, sold - net)), p),
          ...allocate(sells, sold, p),
        ];
  };

  if (excess(lo) <= 0) return { priceCents: lo, fills: ration(lo) };
  if (excess(hi) >= 0) return { priceCents: hi, fills: ration(hi) };
  let a = lo;
  let b = hi;
  while (b / a - 1 > 1e-6) {
    const mid = Math.sqrt(a * b);
    if (excess(mid) > 0) a = mid;
    else b = mid;
  }
  // A limit price inside the final bracket is a jump: clear at that limit, rationing its side.
  const jump = book.find(
    (o) =>
      o.limitCents !== null &&
      (o.side === 'sell'
        ? a < o.limitCents && o.limitCents <= b
        : a <= o.limitCents && o.limitCents < b),
  );
  if (jump) return { priceCents: jump.limitCents!, fills: ration(jump.limitCents!) };
  // A smooth crossing: every order in the money fills in full; the NPC curves absorb rounding.
  const p = Math.round(b);
  const fills: BookFill[] = [];
  for (const o of book) {
    const q = o.available(p);
    if (q > 0) fills.push({ orderId: o.id, qty: q });
  }
  return { priceCents: p, fills };
}

/**
 * One hourly goods clearing: the uniform price where NPC curves and the order book balance, and
 * the fills at that price. At a price bound or a limit-price jump, one side is rationed.
 */
export function clear(
  g: GoodDef,
  m: GoodMarket,
  colonyScale: number,
  orders: Order[],
): { priceCents: number; fills: Fill[] } {
  const book: BookOrder[] = orders
    .filter((o) => o.goodId === g.id)
    .map((o) => ({
      id: o.id,
      side: o.side,
      limitCents: o.limitCents,
      available: (p: number) => available(o, p),
    }));
  const npcNet = (p: number) =>
    (npcDemandTph(g, p, m.pRefCents, colonyScale) - npcSupplyTph(g, p, m.pRefCents)) * 1000;
  const lo = Math.round(g.basePriceCents / MARKET.boundsFactor);
  const hi = Math.round(g.basePriceCents * MARKET.boundsFactor);
  const { priceCents, fills } = clearBook(npcNet, lo, hi, book);
  return { priceCents, fills: fills.map((f) => ({ orderId: f.orderId, kg: f.qty })) };
}

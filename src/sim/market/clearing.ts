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

/** Better-priced orders first; orders exactly at the price share what is left, pro rata. */
function allocate(orders: Order[], totalKg: number, p: number): Fill[] {
  let left = Math.floor(totalKg + 1e-9);
  const fills: Fill[] = [];
  for (const group of [
    orders.filter((o) => o.limitCents !== p),
    orders.filter((o) => o.limitCents === p),
  ]) {
    const want = group.map((o) => available(o, p));
    const sum = want.reduce((a, b) => a + b, 0);
    if (sum === 0) continue;
    const kg = sum <= left ? want : want.map((w) => Math.floor((w * left) / sum));
    let rest = sum <= left ? 0 : left - kg.reduce((a, b) => a + b, 0);
    group.forEach((o, i) => {
      let k = kg[i]!;
      if (rest > 0 && k < want[i]!) {
        k++;
        rest--;
      }
      if (k > 0) fills.push({ orderId: o.id, kg: k });
      left -= k;
    });
  }
  return fills;
}

/**
 * One hourly clearing: the uniform price where NPC curves and the order book balance, and the
 * fills at that price. At a price bound or a limit-price jump, one side is rationed.
 */
export function clear(
  g: GoodDef,
  m: GoodMarket,
  colonyScale: number,
  orders: Order[],
): { priceCents: number; fills: Fill[] } {
  const book = orders.filter((o) => o.goodId === g.id);
  const npcNetKg = (p: number) =>
    (npcDemandTph(g, p, m.pRefCents, colonyScale) - npcSupplyTph(g, p, m.pRefCents)) * 1000;
  const sum = (side: Order['side'], p: number) =>
    book.filter((o) => o.side === side).reduce((kg, o) => kg + available(o, p), 0);
  const excess = (p: number) => npcNetKg(p) + sum('buy', p) - sum('sell', p);
  const ration = (p: number) => {
    const buys = book.filter((o) => o.side === 'buy');
    const sells = book.filter((o) => o.side === 'sell');
    const net = npcNetKg(p);
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

  const lo = Math.round(g.basePriceCents / MARKET.boundsFactor);
  const hi = Math.round(g.basePriceCents * MARKET.boundsFactor);
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
  const fills: Fill[] = [];
  for (const o of book) {
    const kg = available(o, p);
    if (kg > 0) fills.push({ orderId: o.id, kg });
  }
  return { priceCents: p, fills };
}

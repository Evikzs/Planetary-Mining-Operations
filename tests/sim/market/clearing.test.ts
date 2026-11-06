import { describe, expect, it } from 'vitest';
import { GOODS, type GoodId } from '../../../src/data/goods';
import { clear } from '../../../src/sim/market/clearing';
import type { GoodMarket, Order } from '../../../src/sim/market/orders';

const market = (g: GoodId): GoodMarket => ({
  goodId: g,
  pRefCents: GOODS[g].basePriceCents,
  lastCents: GOODS[g].basePriceCents,
  history: [],
  volume24hKg: 0,
});
const order = (
  id: number,
  x: Partial<Order> & Pick<Order, 'goodId' | 'side' | 'qtyKg'>,
): Order => ({
  id,
  companyId: 0,
  kind: 'market',
  filledKg: 0,
  limitCents: null,
  sectionId: 0,
  dailyQtyKg: null,
  escrowKg: x.side === 'sell' ? x.qtyKg : 0,
  escrowCents:
    x.side === 'buy' ? Math.ceil((5 * GOODS[x.goodId].basePriceCents * x.qtyKg) / 1000) : 0,
  ...x,
});

/** A good with the NPC volume it had in the M1 tables, which the results below were recorded with. */
const m1 = (g: GoodId, volumeTph: number) => ({
  ...GOODS[g],
  npc: { ...GOODS[g].npc, volumeTph },
});

// Results recorded from the M1 clearing before its core moved into clearBook (task C6).
describe('goods clearing', () => {
  it('gives the same prices and fills after the clearBook extraction', () => {
    expect(clear(GOODS.ilmenite, market('ilmenite'), 1, [])).toEqual({
      priceCents: 6000,
      fills: [],
    });
    expect(
      clear(m1('helium3', 0.05), market('helium3'), 1, [
        order(1, { goodId: 'helium3', side: 'sell', qtyKg: 5000 }),
      ]),
    ).toEqual({ priceCents: 300000, fills: [{ orderId: 1, kg: 4460 }] });
    expect(
      clear(m1('steel', 12), market('steel'), 1.3, [
        order(1, { goodId: 'steel', side: 'sell', qtyKg: 6000, kind: 'limit', limitCents: 41_000 }),
        order(2, { goodId: 'steel', side: 'buy', qtyKg: 9000 }),
        order(3, { goodId: 'steel', side: 'sell', qtyKg: 2500 }),
      ]),
    ).toEqual({
      priceCents: 48258,
      fills: [
        { orderId: 1, kg: 6000 },
        { orderId: 2, kg: 9000 },
        { orderId: 3, kg: 2500 },
      ],
    });
    expect(
      clear(m1('glass', 8), market('glass'), 1, [
        order(1, {
          goodId: 'glass',
          side: 'sell',
          qtyKg: 400_000,
          kind: 'limit',
          limitCents: 30_000,
        }),
      ]),
    ).toEqual({ priceCents: 30000, fills: [] });
  });
});

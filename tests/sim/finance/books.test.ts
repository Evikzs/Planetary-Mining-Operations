import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { START_BUILDINGS, START_CASH_CENTS, START_STOCK_T } from '../../../src/data/balance';
import { BUILDINGS, type BuildingTypeId, type RecipeId } from '../../../src/data/buildings';
import { GOODS, type GoodId } from '../../../src/data/goods';
import { productionSystem } from '../../../src/sim/build/production';
import { PLAYER, playerCompany } from '../../../src/sim/companies';
import { applyCommand, createGame, step, type StepContext } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { booksBalanced, heldKg, listCostCents, openBooks } from '../../../src/sim/finance/books';
import { add } from '../../../src/sim/inventory';
import { seatCurrentShift } from '../../../src/sim/people/commute';
import { autoAssign } from '../../../src/sim/people/jobs';
import { createRng } from '../../../src/sim/rng';
import type { Building, GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';
import { fromSaveFile } from '../../../src/save/saveFile';
import v2fixture from '../../fixtures/saves/v2-founding.json';

function founded(): GameState {
  const s = createGame(42, { rivals: false });
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}
const books = (s: GameState) => playerCompany(s)!.books;
const home = (s: GameState) => playerCompany(s)!.charterSectionId;
const base = (g: GoodId, kg: number) => Math.round((kg * GOODS[g].basePriceCents) / 1000);

/** Fine steps through the next hourly clearing; returns the events. */
function toNextHour(s: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  do events.push(...step(s, { mode: 'fine' }));
  while (s.tick % 60 !== 0);
  return events;
}

function freePlot(s: GameState, ok: (p: ReturnType<typeof worldOf>['plots'][number]) => boolean) {
  return worldOf(s).plots.find(
    (p) => p.sectionId === home(s) && ok(p) && !s.buildings.some((b) => b.plotId === p.id),
  )!;
}

/** Puts a building up at once, staffed for the current shift. */
function ready(s: GameState, type: BuildingTypeId, plotId: number, recipeId?: RecipeId): Building {
  expect(applyCommand(s, { t: 'build', plotId, type, recipeId })).toEqual({ ok: true });
  const b = s.buildings.find((x) => x.plotId === plotId)!;
  b.status = 'active';
  b.progress = 1;
  b.workHours = 0;
  autoAssign(s);
  seatCurrentShift(s);
  return b;
}

const ctx = (): StepContext => ({
  dtMinutes: 60,
  mode: 'coarse',
  offlineEfficiency: 1,
  events: [],
  rng: createRng(1),
});

describe('books', () => {
  it('founding books balance: share capital = start cash + stock at base price + buildings at list cost', () => {
    const s = founded();
    const stock = Object.entries(START_STOCK_T).reduce(
      (sum, [g, t]) => sum + base(g as GoodId, Math.round(t * 1000)),
      0,
    );
    const buildings = START_BUILDINGS.reduce(
      (sum, type) => sum + listCostCents({ type, level: 1 }),
      0,
    );
    expect(books(s).shareCapitalCents).toBe(START_CASH_CENTS + stock + buildings);
    // With the M1 tables: LM 250,000 + LM 400,600 + LM 108,000.
    expect(books(s).shareCapitalCents).toBe(75_860_000);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('a sale books revenue and its cost; a buy books inventory at the price paid', () => {
    const s = founded();
    const sid = home(s);
    const glassBasis = books(s).pools.glass!.basisCents;
    const glassKg = books(s).pools.glass!.kg;
    applyCommand(s, {
      t: 'placeOrder',
      goodId: 'glass',
      side: 'sell',
      kind: 'market',
      qtyKg: 10_000,
      sectionId: sid,
    });
    applyCommand(s, {
      t: 'placeOrder',
      goodId: 'steel',
      side: 'buy',
      kind: 'market',
      qtyKg: 1_000,
      sectionId: sid,
    });
    const trades = toNextHour(s).filter((e) => e.t === 'trade');
    const sold = trades.filter((e) => e.side === 'sell');
    const bought = trades.filter((e) => e.side === 'buy');
    const soldKg = sold.reduce((n, e) => n + e.kg, 0);
    expect(soldKg).toBeGreaterThan(0);
    expect(bought.length).toBeGreaterThan(0);
    const period = books(s).period;
    expect(period.revenue.sales).toBe(sold.reduce((n, e) => n + e.cents, 0));
    expect(period.expense.cogs).toBe(Math.round((glassBasis * soldKg) / glassKg));
    expect(books(s).pools.steel).toEqual({
      kg: bought.reduce((n, e) => n + e.kg, 0),
      basisCents: bought.reduce((n, e) => n + e.cents, 0),
    });
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('extracted ore enters at zero cost; consumed recipe inputs are expensed as materials', () => {
    const s = founded();
    const scoop = ready(
      s,
      'regolithScoop',
      freePlot(s, (p) => p.deposit?.goodId === 'regolith').id,
    );
    const smelter = ready(s, 'smelter', freePlot(s, (p) => p.kind === 'build').id, 'steel');
    add(smelter.input, 'ilmenite', 8_000);
    openBooks(s, PLAYER);
    const ilmenite = books(s).pools.ilmenite!;
    const before = { ilmeniteKg: ilmenite.kg, ilmeniteBasis: ilmenite.basisCents };
    productionSystem.step(s, ctx());
    expect(scoop.output.regolith ?? 0).toBeGreaterThan(0);
    expect(books(s).pools.regolith).toEqual({ kg: scoop.output.regolith, basisCents: 0 });
    const used = before.ilmeniteKg - (smelter.input.ilmenite ?? 0);
    expect(used).toBeGreaterThan(0);
    expect(books(s).period.expense.materials).toBe(
      Math.round((before.ilmeniteBasis * used) / before.ilmeniteKg),
    );
    expect(books(s).pools.steel?.basisCents ?? 0).toBe(0);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('a building capitalises its cash and materials; demolishing books the refund against book value', () => {
    const s = founded();
    const plot = freePlot(s, (p) => p.kind === 'build');
    expect(applyCommand(s, { t: 'build', plotId: plot.id, type: 'warehouse' })).toEqual({
      ok: true,
    });
    const b = s.buildings.find((x) => x.plotId === plot.id)!;
    const def = BUILDINGS.warehouse;
    const cost =
      def.cost.cents + base('prefabStructures', def.cost.materials.prefabStructures! * 1000);
    expect(b.costCents).toBe(cost);
    expect(b.bookCents).toBe(cost);
    expect(booksBalanced(s, PLAYER)).toEqual([]);
    expect(applyCommand(s, { t: 'demolish', buildingId: b.id })).toEqual({ ok: true });
    expect(books(s).period.expense.writeOffs).toBe(cost - Math.round(def.cost.cents * 0.25));
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });

  it('keeps the books balanced under random commands and ticks (fast-check)', () => {
    const goods: GoodId[] = ['glass', 'prefabStructures', 'oxygen', 'steel', 'ilmenite'];
    const types: BuildingTypeId[] = [
      'warehouse',
      'crewQuarters',
      'regolithScoop',
      'mine',
      'smelter',
    ];
    const action = fc.oneof(
      fc.record({
        k: fc.constant('build' as const),
        type: fc.constantFrom(...types),
        n: fc.nat(20),
      }),
      fc.record({
        k: fc.constant('order' as const),
        good: fc.constantFrom(...goods),
        side: fc.constantFrom('buy' as const, 'sell' as const),
        market: fc.boolean(),
        t: fc.integer({ min: 1, max: 30 }),
      }),
      fc.record({ k: fc.constant('cancel' as const), n: fc.nat(10) }),
      fc.record({ k: fc.constant('demolish' as const), n: fc.nat(20) }),
      fc.record({ k: fc.constant('contract' as const), n: fc.nat(10) }),
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(action, fc.integer({ min: 1, max: 120 })), { maxLength: 12 }),
        (plan) => {
          const s = founded();
          const sid = home(s);
          for (const [a, ticks] of plan) {
            if (a.k === 'build') {
              const plots = worldOf(s).plots.filter((p) => p.sectionId === sid);
              const plot = plots[a.n % plots.length]!;
              applyCommand(s, { t: 'build', plotId: plot.id, type: a.type });
            } else if (a.k === 'order') {
              const price = GOODS[a.good].basePriceCents;
              applyCommand(s, {
                t: 'placeOrder',
                goodId: a.good,
                side: a.side,
                kind: a.market ? 'market' : 'limit',
                qtyKg: a.t * 1000,
                limitCents: a.market ? undefined : price,
                sectionId: sid,
              });
            } else if (a.k === 'cancel') {
              const o = s.orders[a.n % Math.max(1, s.orders.length)];
              if (o) applyCommand(s, { t: 'cancelOrder', orderId: o.id });
            } else if (a.k === 'demolish') {
              const b = s.buildings[a.n % s.buildings.length]!;
              applyCommand(s, { t: 'demolish', buildingId: b.id });
            } else {
              const c = s.contracts[a.n % Math.max(1, s.contracts.length)];
              if (c?.status === 'offered')
                applyCommand(s, { t: 'acceptContract', contractId: c.id });
              else if (c)
                applyCommand(s, { t: 'deliverContract', contractId: c.id, sectionId: sid });
            }
            for (let i = 0; i < ticks; i++) step(s, { mode: 'fine' });
            expect(booksBalanced(s, PLAYER)).toEqual([]);
          }
        },
      ),
      { numRuns: 15 },
    );
  });

  it('opens balanced books for a save without them', () => {
    const res = fromSaveFile(v2fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = res.state;
    expect(booksBalanced(s, PLAYER)).toEqual([]);
    const glass = heldKg(s, PLAYER, 'glass');
    expect(playerCompany(s)!.books.pools.glass).toEqual({
      kg: glass,
      basisCents: base('glass', glass),
    });
    for (let i = 0; i < 120; i++) step(s, { mode: 'fine' });
    expect(booksBalanced(s, PLAYER)).toEqual([]);
  });
});

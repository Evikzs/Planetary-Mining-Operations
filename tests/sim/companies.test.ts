import { describe, expect, it } from 'vitest';
import { START_CASH_CENTS } from '../../src/data/balance';
import { BUILDINGS } from '../../src/data/buildings';
import { cashAccount, PLAYER, playerCompany, sectionOwner } from '../../src/sim/companies';
import { applyCommand, createGame } from '../../src/sim/engine';
import { balance } from '../../src/sim/ledger';
import type { GameState } from '../../src/sim/state';
import { worldOf } from '../../src/sim/world/luna';
import { addTestCompany } from '../helpers/companies';

function founded(seed = 42): GameState {
  const s = createGame(seed);
  const res = applyCommand(s, {
    t: 'foundCompany',
    name: 'Selene Rock Co',
    companionId: 'veteran',
  });
  expect(res).toEqual({ ok: true });
  return s;
}

/** A section that does not touch the player's charter. */
function otherSection(s: GameState): number {
  const w = worldOf(s);
  return w.sections.find(
    (x) => x.id !== w.foundingSectionId && !x.neighbors.includes(w.foundingSectionId),
  )!.id;
}

function freeBuildPlot(s: GameState, sectionId: number): number {
  return worldOf(s).plots.find(
    (p) =>
      p.sectionId === sectionId &&
      p.kind === 'build' &&
      !s.buildings.some((b) => b.plotId === p.id),
  )!.id;
}

describe('companies', () => {
  it('founding creates company 0 with reputation 20, standard wages and its charter section', () => {
    const s = founded();
    const c = playerCompany(s)!;
    expect(c).toMatchObject({
      id: PLAYER,
      name: 'Selene Rock Co',
      kind: 'player',
      status: 'active',
      reputation: { group: 20, luna: 20 },
      wageLevel: { miner: 'standard', technician: 'standard', engineer: 'standard' },
      payrollShortfall: false,
    });
    expect(c.charterSectionId).toBe(worldOf(s).foundingSectionId);
    expect(sectionOwner(s, c.charterSectionId)).toBe(PLAYER);
    expect(balance(s.ledger, cashAccount(PLAYER))).toBe(START_CASH_CENTS);
    expect(applyCommand(s, { t: 'foundCompany', name: 'Other', companionId: 'veteran' })).toEqual({
      ok: false,
      error: 'ALREADY_FOUNDED',
    });
  });

  it('a second company owns its own section; the player gets NOT_OWNED building there', () => {
    const s = founded();
    const sid = otherSection(s);
    addTestCompany(s, 1, sid);
    expect(sectionOwner(s, sid)).toBe(1);
    const plotId = freeBuildPlot(s, sid);
    const cmd = { t: 'build', plotId, type: 'warehouse' } as const;
    expect(applyCommand(s, cmd)).toEqual({ ok: false, error: 'NOT_OWNED' });
    expect(applyCommand(s, cmd, 1)).toEqual({ ok: true });
    expect(balance(s.ledger, cashAccount(1))).toBe(
      START_CASH_CENTS - BUILDINGS.warehouse.cost.cents,
    );
    expect(balance(s.ledger, cashAccount(PLAYER))).toBe(START_CASH_CENTS);
    const mine = freeBuildPlot(s, playerCompany(s)!.charterSectionId);
    expect(applyCommand(s, { t: 'build', plotId: mine, type: 'warehouse' }, 1)).toEqual({
      ok: false,
      error: 'NOT_OWNED',
    });
  });

  it("company 1 cannot cancel the player's order or set the player's wages", () => {
    const s = founded();
    const sid = playerCompany(s)!.charterSectionId;
    addTestCompany(s, 1, otherSection(s));
    const sell = {
      t: 'placeOrder',
      goodId: 'glass',
      side: 'sell',
      kind: 'limit',
      qtyKg: 1000,
      limitCents: 1_000_000,
      sectionId: sid,
    } as const;
    expect(applyCommand(s, sell, 1)).toEqual({ ok: false, error: 'NOT_OWNED' });
    expect(applyCommand(s, sell)).toEqual({ ok: true });
    const order = s.orders[0]!;
    expect(order.companyId).toBe(PLAYER);
    expect(applyCommand(s, { t: 'cancelOrder', orderId: order.id }, 1)).toEqual({
      ok: false,
      error: 'NOT_OWNED',
    });
    expect(applyCommand(s, { t: 'setWageLevel', skill: 'miner', level: 'high' }, 1)).toEqual({
      ok: true,
    });
    expect(playerCompany(s)!.wageLevel.miner).toBe('standard');
    expect(s.companies[1]!.wageLevel.miner).toBe('high');
  });

  it('only the player founds a company, and a company that does not exist cannot act', () => {
    const s = createGame(42);
    const found = { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' } as const;
    expect(applyCommand(s, found, 1)).toEqual({ ok: false, error: 'NOT_OWNED' });
    expect(applyCommand(s, { t: 'setWageLevel', skill: 'miner', level: 'low' }, 3)).toEqual({
      ok: false,
      error: 'NOT_FOUNDED',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { START_CASH_CENTS } from '../../src/data/balance';
import { BUILDINGS } from '../../src/data/buildings';
import { productionRateTph, productionSystem } from '../../src/sim/build/production';
import {
  cashAccount,
  PLAYER,
  playerCompany,
  sectionOwner,
  workerCompany,
} from '../../src/sim/companies';
import type { Contract } from '../../src/sim/contracts/contracts';
import { boardSize } from '../../src/sim/contracts/rewards';
import { applyCommand, createGame, step, type StepContext } from '../../src/sim/engine';
import { hashState } from '../../src/sim/hash';
import { balance, transfer } from '../../src/sim/ledger';
import { seatCurrentShift } from '../../src/sim/people/commute';
import { autoAssign } from '../../src/sim/people/jobs';
import { payrollCentsPerHour } from '../../src/sim/people/payroll';
import { createRng } from '../../src/sim/rng';
import type { Building, GameState } from '../../src/sim/state';
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

describe('per-company systems', () => {
  /** Runs fine ticks up to and including the next game hour. */
  function toNextHour(s: GameState): void {
    do step(s, { mode: 'fine' });
    while (s.tick % 60 !== 0);
  }

  it('each company pays its own workers from its own cash at its own wage level', () => {
    const s = founded();
    addTestCompany(s, 1, otherSection(s));
    applyCommand(s, { t: 'setWageLevel', skill: 'miner', level: 'high' }, 1);
    // 18 miners, 12 technicians, 3 engineers each; company 1 pays its miners 25% more.
    expect(payrollCentsPerHour(s, PLAYER)).toBe(18 * 375 + 12 * 542 + 3 * 833);
    expect(payrollCentsPerHour(s, 1)).toBe(18 * 469 + 12 * 542 + 3 * 833);
    while (s.tick % 60 !== 59) step(s, { mode: 'fine' });
    const before = [balance(s.ledger, cashAccount(PLAYER)), balance(s.ledger, cashAccount(1))];
    const due = [payrollCentsPerHour(s, PLAYER), payrollCentsPerHour(s, 1)];
    step(s, { mode: 'fine' });
    // Migration may add a worker on the hour before payroll runs; payroll pays the books as they stand.
    const paid = [
      before[0]! - balance(s.ledger, cashAccount(PLAYER)),
      before[1]! - balance(s.ledger, cashAccount(1)),
    ];
    expect(paid).toEqual([payrollCentsPerHour(s, PLAYER), payrollCentsPerHour(s, 1)]);
    expect(paid[1]! - paid[0]!).toBeGreaterThanOrEqual(due[1]! - due[0]! - 469);
  });

  it("a company short of cash lowers only its own workers' morale", () => {
    const s = founded();
    addTestCompany(s, 1, otherSection(s));
    // No credit line to fall back on: rating D lends nothing.
    s.companies[1]!.credit.rating = 'D';
    transfer(s.ledger, cashAccount(1), 'world', balance(s.ledger, cashAccount(1)));
    for (let h = 0; h < 4; h++) toNextHour(s);
    expect(s.companies[1]!.payrollShortfall).toBe(true);
    expect(playerCompany(s)!.payrollShortfall).toBe(false);
    const avg = (co: number) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < s.people.count; i++) {
        if (workerCompany(s, i) !== co) continue;
        sum += s.people.morale[i]!;
        n++;
      }
      return sum / n;
    };
    expect(avg(1)).toBeLessThan(avg(PLAYER) - 5);
  });

  it('rival events stay out of player alerts and story', () => {
    const s = founded();
    const sid = otherSection(s);
    addTestCompany(s, 1, sid);
    for (const b of s.buildings.filter((x) => x.sectionId === sid && x.type === 'solarArray')) {
      expect(applyCommand(s, { t: 'demolish', buildingId: b.id }, 1)).toEqual({ ok: true });
    }
    for (let i = 0; i < 120; i++) step(s, { mode: 'fine' });
    expect(s.sections.find((x) => x.id === sid)!.power.factor).toBeLessThan(1);
    expect(s.alerts.filter((a) => a.t === 'brownout')).toEqual([]);
    expect(s.story.seen).not.toContain('ch1.power');
    expect(s.story.queue).not.toContain('ch1.power');
  });

  it('the contract board grows with the best reputation among companies', () => {
    const s = founded();
    addTestCompany(s, 1, otherSection(s));
    s.companies[1]!.reputation = { group: 100, luna: 100 };
    let most = 0;
    for (let h = 0; h < 200; h++) {
      step(s, { mode: 'coarse' });
      most = Math.max(most, s.contracts.filter((c) => c.status === 'offered').length);
    }
    expect(most).toBeGreaterThan(boardSize(20));
  });

  it('only the tendered company can accept an infrastructure offer', () => {
    // Guard: acceptance already needs the plot's section (C1); C2 keeps it so.
    const s = founded();
    addTestCompany(s, 1, otherSection(s));
    const plot = worldOf(s).plots.find(
      (p) => p.sectionId === playerCompany(s)!.charterSectionId && p.kind === 'public',
    )!;
    const offer: Contract = {
      id: s.nextId++,
      type: 'infrastructure',
      issuer: 'Lunar Authority',
      status: 'offered',
      offeredTick: s.tick,
      deadlineTick: s.tick + 48 * 60,
      hours: 100,
      rewardCents: 100_000,
      repGain: 5,
      repLoss: 8,
      stages: [{ kind: 'build', engineerHours: 12, done: 0 }],
      stageIndex: 0,
      plotId: plot.id,
      asset: 'commMast',
      holder: null,
      tenderTo: PLAYER,
    };
    s.contracts.push(offer);
    expect(applyCommand(s, { t: 'acceptContract', contractId: offer.id }, 1)).toEqual({
      ok: false,
      error: 'NOT_OWNED',
    });
    expect(applyCommand(s, { t: 'acceptContract', contractId: offer.id })).toEqual({ ok: true });
    expect(offer.holder).toBe(PLAYER);
  });

  it("offline efficiency halves only the player's production", () => {
    const s = founded();
    const sid = otherSection(s);
    addTestCompany(s, 1, sid);
    const scoopIn = (section: number, actor: number) => {
      const plot = worldOf(s).plots.find(
        (p) => p.sectionId === section && p.deposit?.goodId === 'regolith',
      )!;
      expect(
        applyCommand(s, { t: 'build', plotId: plot.id, type: 'regolithScoop' }, actor),
      ).toEqual({ ok: true });
      const b = s.buildings.find((x) => x.plotId === plot.id)!;
      b.status = 'active';
      b.progress = 1;
      b.workHours = 0;
      return b;
    };
    const mine = scoopIn(playerCompany(s)!.charterSectionId, PLAYER);
    const theirs = scoopIn(sid, 1);
    autoAssign(s);
    seatCurrentShift(s);
    const rate = (b: Building) => (productionRateTph(s, b).regolith ?? 0) * 1000;
    const expected = [rate(mine) * 0.5, rate(theirs)];
    expect(expected[0]).toBeGreaterThan(0);
    expect(expected[1]).toBeGreaterThan(0);
    const ctx = {
      dtMinutes: 60,
      mode: 'coarse',
      offlineEfficiency: 0.5,
      events: [],
      rng: createRng(1),
    } as StepContext;
    productionSystem.step(s, ctx);
    expect(Math.abs((mine.output.regolith ?? 0) - expected[0]!)).toBeLessThanOrEqual(5);
    expect(Math.abs((theirs.output.regolith ?? 0) - expected[1]!)).toBeLessThanOrEqual(5);
  });

  it('is deterministic with two companies', () => {
    const run = () => {
      const s = founded();
      addTestCompany(s, 1, otherSection(s));
      for (let i = 0; i < 600; i++) step(s, { mode: 'fine' });
      return hashState(s);
    };
    expect(run()).toBe(run());
  });
});

import { describe, expect, it } from 'vitest';
import { GOODS, type GoodId } from '../../../src/data/goods';
import { sectionState } from '../../../src/sim/build/sections';
import type { Contract } from '../../../src/sim/contracts/contracts';
import { generateOffer } from '../../../src/sim/contracts/generate';
import { boardSize, maxActive, oreDeliveryReward } from '../../../src/sim/contracts/rewards';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { checkInvariants } from '../../../src/sim/invariants';
import { balance } from '../../../src/sim/ledger';
import { addWorker, SKILL_CODE } from '../../../src/sim/people/store';
import { createRng } from '../../../src/sim/rng';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function run(s: GameState, n: number, mode: 'fine' | 'coarse' = 'fine'): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(s, { mode }));
  return events;
}

/** Puts a known offer on the board. */
function offer(s: GameState, c: Partial<Contract> = {}): Contract {
  const contract: Contract = {
    id: s.nextId++,
    type: 'oreDelivery',
    issuer: 'Lunar Authority',
    status: 'offered',
    offeredTick: s.tick,
    deadlineTick: s.tick + 48 * 60,
    hours: 30,
    rewardCents: 100_000,
    repGain: 3,
    repLoss: 5,
    stages: [{ kind: 'deliver', needKg: { ilmenite: 10_000 }, doneKg: {} }],
    stageIndex: 0,
    plotId: null,
    asset: null,
    ...c,
  };
  s.contracts.push(contract);
  return contract;
}

const accept = (s: GameState, c: Contract) =>
  applyCommand(s, { t: 'acceptContract', contractId: c.id });
const deliver = (s: GameState, c: Contract) =>
  applyCommand(s, { t: 'deliverContract', contractId: c.id, sectionId: home });

describe('rewards and limits', () => {
  it('board size 4 at rep 20, 8 at rep 100; active limit 2 at rep 20', () => {
    expect(boardSize(20)).toBe(4);
    expect(boardSize(100)).toBe(8);
    expect(maxActive(20)).toBe(2);
    expect(maxActive(100)).toBe(6);
  });

  it('oreDeliveryReward(100 t, 6000¢, 1.2, 100 h, rep 20) = 748800', () => {
    expect(
      oreDeliveryReward({
        amountT: 100,
        pRefCents: 6000,
        margin: 1.2,
        deadlineHours: 100,
        reputation: 20,
      }),
    ).toBe(748800);
  });

  it('generated offers follow the rules', () => {
    const s = founded();
    const rng = createRng(7);
    const seen = new Set<string>();
    for (let k = 0; k < 300; k++) {
      const c = generateOffer(s, rng);
      seen.add(c.type);
      expect(c.rewardCents).toBeGreaterThan(0);
      expect(Number.isSafeInteger(c.rewardCents)).toBe(true);
      const first = c.stages[0]!;
      if (first.kind !== 'deliver') throw new Error('first stage must be a delivery');
      if (c.type === 'oreDelivery') {
        const [good, kg] = Object.entries(first.needKg)[0] as [GoodId, number];
        const [lo, hi] = good === 'helium3' ? [0.05, 0.3] : [30, 150];
        expect(kg / 1000).toBeGreaterThanOrEqual(lo);
        expect(kg / 1000).toBeLessThanOrEqual(hi);
        expect(c.hours).toBeGreaterThanOrEqual(25);
        // Pays at least the goods at market value.
        expect(c.rewardCents).toBeGreaterThan((kg / 1000) * GOODS[good].basePriceCents);
      } else {
        expect(world.plots[c.plotId!]!.kind).toBe('public');
        expect(c.stages.map((x) => x.kind)).toEqual(['deliver', 'build', 'staff']);
        expect(c.hours).toBeGreaterThanOrEqual(72);
        expect(c.hours).toBeLessThanOrEqual(168);
      }
    }
    expect(seen).toEqual(new Set(['oreDelivery', 'infrastructure']));
  });
});

describe('contracts', () => {
  it('partial then full delivery completes and pays', () => {
    const s = founded();
    const c = offer(s);
    expect(accept(s, c)).toEqual({ ok: true });
    const depot = sectionState(s, home)!.depot;
    depot.ilmenite = 4_000;
    expect(deliver(s, c)).toEqual({ ok: true });
    expect(deliver(s, c)).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK' });
    depot.ilmenite = 10_000;
    expect(deliver(s, c)).toEqual({ ok: true });
    expect(depot.ilmenite).toBe(4_000);
    const cash = balance(s.ledger, 'player');
    const pop = s.colonyPop;
    const events = run(s, 1);
    expect(c.status).toBe('completed');
    expect(balance(s.ledger, 'player') - cash).toBe(100_000);
    expect(s.reputation).toBe(23);
    expect(s.colonyPop - pop).toBeGreaterThanOrEqual(40);
    expect(s.colonyPop - pop).toBeLessThanOrEqual(120);
    expect(events).toContainEqual({ t: 'contractCompleted', contractId: c.id });
    expect(events).toContainEqual({
      t: 'income',
      plotId: null,
      cents: 100_000,
      source: 'contract',
    });
    expect(deliver(s, c)).toEqual({ ok: false, error: 'NOT_ACTIVE' });
  });

  it('missed deadline fails with −5 rep', () => {
    const s = founded();
    const c = offer(s, { hours: 2 });
    accept(s, c);
    const events = run(s, 121);
    expect(c.status).toBe('failed');
    expect(s.reputation).toBe(15);
    expect(events).toContainEqual({ t: 'contractFailed', contractId: c.id });
  });

  it('abandoning costs 4 reputation and keeps what was delivered', () => {
    const s = founded();
    const c = offer(s);
    accept(s, c);
    sectionState(s, home)!.depot.ilmenite = 4_000;
    deliver(s, c);
    expect(applyCommand(s, { t: 'abandonContract', contractId: c.id })).toEqual({ ok: true });
    expect(c.status).toBe('abandoned');
    expect(s.reputation).toBe(16);
    expect(sectionState(s, home)!.depot.ilmenite ?? 0).toBe(0);
  });

  it('infrastructure runs deliver → build → staff and grows the colony', () => {
    const s = founded();
    const plot = world.plots.find((p) => p.sectionId === home && p.kind === 'public')!;
    const quarters = s.buildings.find((b) => b.type === 'crewQuarters')!.id;
    for (const skill of ['engineer', 'technician'] as const) {
      for (let k = 0; k < 6; k++) {
        addWorker(s.people, {
          first: 0,
          last: 0,
          skill: SKILL_CODE[skill],
          level: 1,
          home: quarters,
        });
      }
    }
    const c = offer(s, {
      type: 'infrastructure',
      plotId: plot.id,
      asset: 'commMast',
      hours: 100,
      repGain: 5,
      repLoss: 8,
      stages: [
        { kind: 'deliver', needKg: { prefabStructures: 2_000, steel: 1_000 }, doneKg: {} },
        { kind: 'build', engineerHours: 12, done: 0 },
        { kind: 'staff', technicians: 2, hours: 3, done: 0 },
      ],
    });
    expect(accept(s, c)).toEqual({ ok: true });
    const site = s.buildings.find((b) => b.plotId === plot.id)!;
    expect(site.type).toBe('contractSite');
    sectionState(s, home)!.depot.steel = 1_000;
    expect(deliver(s, c)).toEqual({ ok: true });
    expect(c.stageIndex).toBe(1);
    const pop = s.colonyPop;
    for (let h = 0; h < 48 && c.status === 'active'; h++) run(s, 1, 'coarse');
    expect(c.status).toBe('completed');
    expect(s.reputation).toBe(25);
    expect(s.clientAssets).toContainEqual({ plotId: plot.id, asset: 'commMast' });
    expect(s.colonyPop).toBeGreaterThan(pop);
    expect(s.buildings.some((b) => b.plotId === plot.id)).toBe(false);
    expect(Array.from(s.people.job.subarray(0, s.people.count))).not.toContain(site.id);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('offers expire after 48 hours; accept beyond the limit → CONTRACT_LIMIT', () => {
    const s = founded();
    const [a, b, c, d] = [offer(s), offer(s), offer(s), offer(s)];
    expect(accept(s, a)).toEqual({ ok: true });
    expect(accept(s, b)).toEqual({ ok: true });
    expect(accept(s, c)).toEqual({ ok: false, error: 'CONTRACT_LIMIT' });
    run(s, 47, 'coarse');
    expect(s.contracts).toContain(d);
    run(s, 1, 'coarse');
    expect(s.contracts).not.toContain(d);
    expect(accept(s, d)).toEqual({ ok: false, error: 'UNKNOWN_ID' });
  });

  it('the board fills with offers over time, up to its size', () => {
    const s = founded();
    const offered: number[] = [];
    for (let h = 0; h < 72; h++) {
      run(s, 1, 'coarse');
      offered.push(s.contracts.filter((x) => x.status === 'offered').length);
    }
    expect(Math.max(...offered)).toBeGreaterThan(0);
    expect(Math.max(...offered)).toBeLessThanOrEqual(boardSize(s.reputation));
  });

  it('a contract site cannot be built, upgraded or demolished by the player', () => {
    const s = founded();
    const plot = world.plots.find((p) => p.sectionId === home && p.kind === 'public')!;
    expect(applyCommand(s, { t: 'build', plotId: plot.id, type: 'contractSite' })).toEqual({
      ok: false,
      error: 'WRONG_PLOT_KIND',
    });
    const c = offer(s, {
      type: 'infrastructure',
      plotId: plot.id,
      asset: 'landingPad',
      stages: [{ kind: 'build', engineerHours: 12, done: 0 }],
    });
    accept(s, c);
    const site = s.buildings.find((b) => b.plotId === plot.id)!;
    expect(applyCommand(s, { t: 'demolish', buildingId: site.id })).toEqual({
      ok: false,
      error: 'CANNOT_DEMOLISH',
    });
    expect(applyCommand(s, { t: 'upgrade', buildingId: site.id })).toEqual({
      ok: false,
      error: 'MAX_LEVEL',
    });
  });
});

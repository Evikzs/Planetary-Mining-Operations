import { describe, expect, it } from 'vitest';
import type { Command } from '../../../src/sim/commands';
import { PLAYER, type CompanyId } from '../../../src/sim/companies';
import type { Contract } from '../../../src/sim/contracts/contracts';
import { applyCommand, createGame, step, SYSTEMS, type System } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { openBooks } from '../../../src/sim/finance/books';
import { hashState } from '../../../src/sim/hash';
import { checkInvariants } from '../../../src/sim/invariants';
import { createRivalsSystem, decisionMinute } from '../../../src/sim/rivals/ai';
import type { GameState } from '../../../src/sim/state';

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
const RIGS = ['mine', 'regolithScoop', 'iceDrill', 'he3Harvester'];
const sectionOf = (s: GameState, co: CompanyId) =>
  s.companies.find((c) => c.id === co)!.charterSectionId;
const buildingsOf = (s: GameState, co: CompanyId) =>
  s.buildings.filter((b) => s.sections.find((x) => x.id === b.sectionId)?.owner === co);

/** A public offer of 30 t regolith for LM 30,000, put on the board at `offeredTick`. */
function regolithOffer(s: GameState, offeredTick: number): Contract {
  return {
    id: s.nextId++,
    type: 'oreDelivery',
    issuer: 'Lunar Authority',
    status: 'offered',
    offeredTick,
    deadlineTick: offeredTick + 48 * 60,
    hours: 30,
    rewardCents: 3_000_000,
    repGain: 3,
    repLoss: 5,
    stages: [{ kind: 'deliver', needKg: { regolith: 30_000 }, doneKg: {} }],
    stageIndex: 0,
    plotId: null,
    asset: null,
    holder: null,
    tenderTo: null,
  };
}

/** Runs with the rivals system replaced, and puts it back. */
function withRivals<T>(system: System, run: () => T): T {
  const i = SYSTEMS.findIndex((x) => x.id === 'rivals');
  const original = SYSTEMS[i]!;
  SYSTEMS[i] = system;
  try {
    return run();
  } finally {
    SYSTEMS[i] = original;
  }
}

describe('rival AI: operations', () => {
  it('rivals change the world only through applyCommand', () => {
    const log: { tick: number; actor: CompanyId; cmd: Command }[] = [];
    const a = withRivals(
      createRivalsSystem((state, cmd, actor) => {
        log.push({ tick: state.tick, actor, cmd: structuredClone(cmd) });
        return applyCommand(state, cmd, actor);
      }),
      () => {
        const s = founded();
        hours(s, 48);
        return hashState(s);
      },
    );
    expect(log.length).toBeGreaterThan(0);
    const replay: System = {
      id: 'rivals',
      step(state) {
        for (const e of log) if (e.tick === state.tick) applyCommand(state, e.cmd, e.actor);
      },
    };
    const b = withRivals(replay, () => {
      const s = founded();
      hours(s, 48);
      return hashState(s);
    });
    expect(b).toBe(a);
  });

  it('decides once an hour at its own minute', () => {
    expect(decisionMinute(1)).toBe(11);
    expect(decisionMinute(5)).toBe(55);
    expect(new Set([1, 2, 3, 4, 5].map(decisionMinute)).size).toBe(5);
  });

  it('a rival builds an extractor on a deposit within 12 game hours and sells its output', () => {
    const s = founded();
    hours(s, 12);
    const rigs = buildingsOf(s, 1).filter((b) => RIGS.includes(b.type));
    expect(rigs.length).toBeGreaterThan(0);
    const sold = hours(s, 60).some(
      (e) => e.t === 'trade' && e.side === 'sell' && e.companyId !== PLAYER,
    );
    expect(sold).toBe(true);
  });

  it('a rival short of oxygen buys it before it runs out', () => {
    const s = founded();
    const depot = s.sections.find((x) => x.id === sectionOf(s, 1))!.depot;
    depot.oxygen = 40; // under two days for 33 residents
    openBooks(s, 1);
    let lowest = Infinity;
    const events: SimEvent[] = [];
    for (let h = 0; h < 6; h++) {
      events.push(...step(s, { mode: 'coarse' }));
      lowest = Math.min(lowest, depot.oxygen ?? 0);
    }
    expect(
      events.some(
        (e) => e.t === 'trade' && e.side === 'buy' && e.goodId === 'oxygen' && e.companyId === 1,
      ),
    ).toBe(true);
    expect(lowest).toBeGreaterThan(0);
  });

  it('a rival accepts and delivers an ore contract it can fill', () => {
    const s = founded();
    const depot = s.sections.find((x) => x.id === sectionOf(s, 2))!.depot;
    depot.regolith = 60_000;
    openBooks(s, 2);
    // On the board for 12 game hours: the player has had first look.
    const offer = regolithOffer(s, s.tick - 12 * 60);
    s.contracts.push(offer);
    hours(s, 6);
    expect(offer.holder).not.toBeNull();
    expect(offer.holder).not.toBe(PLAYER);
    hours(s, 12);
    expect(offer.status).toBe('completed');
  });

  it('rivals leave a fresh ore offer to the player for 12 game hours', () => {
    const s = founded();
    const depot = s.sections.find((x) => x.id === sectionOf(s, 2))!.depot;
    depot.regolith = 60_000;
    openBooks(s, 2);
    const offer = regolithOffer(s, s.tick);
    s.contracts.push(offer);
    hours(s, 11);
    expect(offer.holder).toBeNull();
    hours(s, 2);
    expect(offer.holder).not.toBeNull();
    expect(offer.holder).not.toBe(PLAYER);
  });

  it('after 3 game days the expander has built more than the cautious miner', () => {
    const s = founded();
    const start = [buildingsOf(s, 1).length, buildingsOf(s, 2).length];
    hours(s, 72);
    expect(buildingsOf(s, 1).length - start[0]!).toBeGreaterThan(
      buildingsOf(s, 2).length - start[1]!,
    );
  });

  it("rivals never touch the player's sections, orders or contracts", () => {
    const s = founded();
    const charter = sectionOf(s, PLAYER);
    hours(s, 72);
    for (const b of s.buildings.filter((x) => x.sectionId === charter)) {
      expect(s.sections.find((x) => x.id === b.sectionId)!.owner).toBe(PLAYER);
    }
    expect(s.orders.every((o) => o.companyId === PLAYER || o.sectionId !== charter)).toBe(true);
    // A tender to the player is never taken by a rival.
    expect(
      s.contracts.every((c) => c.tenderTo !== PLAYER || c.holder === null || c.holder === PLAYER),
    ).toBe(true);
    expect(s.sections.filter((x) => x.owner === PLAYER).map((x) => x.id)).toEqual([charter]);
  });

  it("3 game days with 5 rivals keep every company's books balanced and invariants clean", () => {
    const s = founded();
    hours(s, 72);
    expect(checkInvariants(s)).toEqual([]);
  });
});

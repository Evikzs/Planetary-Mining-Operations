import { describe, expect, it } from 'vitest';
import { START_CASH_CENTS, START_WORKERS } from '../../../src/data/balance';
import { REPLACEMENT_NAMES, RIVALS } from '../../../src/data/companies';
import { cashAccount, PLAYER, playerCompany } from '../../../src/sim/companies';
import { applyCommand, createGame, step, SYSTEMS } from '../../../src/sim/engine';
import { booksBalanced } from '../../../src/sim/finance/books';
import { listingOf } from '../../../src/sim/finance/shares';
import { hashState } from '../../../src/sim/hash';
import { balance } from '../../../src/sim/ledger';
import type { GameState } from '../../../src/sim/state';
import { buildUiSnapshot, queryPeople } from '../../../src/sim/views';
import { worldOf } from '../../../src/sim/world/luna';
import { fromSaveFile } from '../../../src/save/saveFile';
import v2fixture from '../../fixtures/saves/v2-founding.json';

function founded(name = 'Selene Rock Co'): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name, companionId: 'veteran' });
  return s;
}

/** Neighbour hops between two sections. */
function hops(s: GameState, from: number, to: number): number {
  const w = worldOf(s);
  const seen = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) return seen.get(at)!;
    for (const n of w.sections[at]!.neighbors) {
      if (!seen.has(n)) {
        seen.set(n, seen.get(at)! + 1);
        queue.push(n);
      }
    }
  }
  return Infinity;
}

const workersOf = (s: GameState, sectionId: number) => {
  const homes = new Set(s.buildings.filter((b) => b.sectionId === sectionId).map((b) => b.id));
  let n = 0;
  for (let i = 0; i < s.people.count; i++) if (homes.has(s.people.home[i]!)) n++;
  return n;
};

describe('rival companies', () => {
  it('founds 5 rivals on distinct charters, 2+ hops from each other and from the player', () => {
    const s = founded();
    expect(s.companies.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.companies.slice(1).map((c) => [c.name, c.archetype, c.colour])).toEqual(
      RIVALS.map((r) => [r.name, r.archetype, r.colour]),
    );
    const charters = s.companies.map((c) => c.charterSectionId);
    expect(new Set(charters).size).toBe(6);
    for (let i = 0; i < charters.length; i++) {
      for (let j = i + 1; j < charters.length; j++) {
        expect(hops(s, charters[i]!, charters[j]!)).toBeGreaterThanOrEqual(2);
      }
    }
    expect(playerCompany(s)!.colour).toBe('burntOrange');
  });

  it("each rival starts with the player's cash, stock, buildings and 33 workers, listed, with balanced books", () => {
    const s = founded();
    const startWorkers = Object.values(START_WORKERS).reduce((a, b) => a + b, 0);
    const playerSection = s.sections.find((x) => x.owner === PLAYER)!;
    const types = (sid: number) =>
      s.buildings
        .filter((b) => b.sectionId === sid)
        .map((b) => b.type)
        .sort();
    for (const c of s.companies.slice(1)) {
      expect(balance(s.ledger, cashAccount(c.id))).toBe(START_CASH_CENTS);
      const section = s.sections.find((x) => x.owner === c.id)!;
      expect(section.depot).toEqual(playerSection.depot);
      expect(types(section.id)).toEqual(types(playerSection.id));
      expect(workersOf(s, section.id)).toBe(startWorkers);
      expect(listingOf(s, c.id)!.outstanding).toBe(100_000);
      expect(c.credit.rating).toBe('BBB');
      expect(booksBalanced(s, c.id)).toEqual([]);
    }
  });

  it('rival workers ride rival buses and are paid from rival cash', () => {
    const s = founded();
    // The AI off, so cash moves by payroll alone.
    const k = SYSTEMS.findIndex((x) => x.id === 'rivals');
    const ai = SYSTEMS[k]!;
    SYSTEMS[k] = { id: 'rivals', step: () => {} };
    try {
      for (let i = 0; i < 60; i++) step(s, { mode: 'fine' });
    } finally {
      SYSTEMS[k] = ai;
    }
    for (const c of s.companies.slice(1)) {
      expect(s.trips.some((t) => t.sectionId === c.charterSectionId) || s.tick > 60).toBe(true);
      expect(c.books.period.expense.wages).toBeGreaterThan(0);
      expect(balance(s.ledger, cashAccount(c.id))).toBeLessThan(START_CASH_CENTS);
    }
    const riders = new Set(s.trips.map((t) => t.sectionId));
    expect(s.companies.slice(1).some((c) => riders.has(c.charterSectionId))).toBe(true);
  });

  it('founds missing rivals on load', () => {
    const res = fromSaveFile(v2fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.companies).toHaveLength(6);
    for (const c of res.state.companies) expect(booksBalanced(res.state, c.id)).toEqual([]);
  });

  it('a player named like a rival pushes that rival to a replacement name', () => {
    const s = founded('tycho deepworks');
    expect(s.companies[1]!.name).toBe(REPLACEMENT_NAMES[0]);
    expect(s.companies[1]!.archetype).toBe('expander');
  });

  it('can start a game without rivals', () => {
    const s = createGame(42, { rivals: false });
    applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
    expect(s.companies).toHaveLength(1);
  });

  it('is deterministic', () => {
    const run = () => {
      const s = founded();
      for (let h = 0; h < 30; h++) step(s, { mode: 'coarse' });
      return hashState(s);
    };
    expect(run()).toBe(run());
  });
});

describe("the player's snapshot with rivals", () => {
  it("lists only the player's sections, buildings, workers, orders, contracts and people", () => {
    const s = createGame(42);
    applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
    const rivalSection = s.companies[1]!.charterSectionId;
    applyCommand(
      s,
      {
        t: 'placeOrder',
        goodId: 'glass',
        side: 'sell',
        kind: 'limit',
        qtyKg: 1000,
        limitCents: 10_000_000,
        sectionId: rivalSection,
      },
      1,
    );
    const ui = buildUiSnapshot(s);
    const mine = new Set(
      s.buildings
        .filter(
          (b) =>
            b.sectionId !== rivalSection &&
            s.sections.find((x) => x.id === b.sectionId)?.owner === PLAYER,
        )
        .map((b) => b.id),
    );
    expect(ui.sections.map((x) => x.id)).toEqual([playerCompany(s)!.charterSectionId]);
    expect(ui.buildings.every((b) => mine.has(b.id))).toBe(true);
    expect(ui.workforce.total).toBe(33);
    expect(ui.orders).toEqual([]);
    const people = queryPeople(s, {}, 0, 500);
    expect(people.total).toBe(33);
  });
});

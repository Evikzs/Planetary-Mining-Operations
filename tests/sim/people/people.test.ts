import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { checkInvariants } from '../../../src/sim/invariants';
import { balance, transfer } from '../../../src/sim/ledger';
import { sectionState } from '../../../src/sim/build/sections';
import { targetMorale } from '../../../src/sim/people/morale';
import { payrollCentsPerHour } from '../../../src/sim/people/payroll';
import {
  addWorker,
  createPeople,
  indexOfId,
  removeWorkerAt,
  SKILL_CODE,
  workerName,
} from '../../../src/sim/people/store';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

const home = worldOf({ seed: 42 }).foundingSectionId;

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

const quarters = (s: GameState) => s.buildings.find((b) => b.type === 'crewQuarters')!;

function run(s: GameState, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(s, { mode: 'fine' }));
  return out;
}

describe('people store', () => {
  it('ids stay stable after swap-remove; grows to 10,000', () => {
    const p = createPeople(4);
    const ids = [0, 1, 2].map((i) =>
      addWorker(p, { first: i, last: i, skill: 0, level: 1, home: -1 }),
    );
    removeWorkerAt(p, indexOfId(p, ids[1]!));
    expect(p.count).toBe(2);
    expect(p.first[indexOfId(p, ids[2]!)]).toBe(2);
    expect(indexOfId(p, ids[1]!)).toBe(-1);
    for (let i = 0; i < 10_000; i++)
      addWorker(p, { first: 0, last: 0, skill: 1, level: 1, home: -1 });
    expect(p.count).toBe(10_002);
    expect(workerName(p, 0)).toMatch(/^\S+ \S+/);
  });
});

describe('founding crew', () => {
  it('founding adds 33 housed workers: 18 miners, 12 technicians, 3 engineers', () => {
    const s = founded();
    expect(s.people.count).toBe(33);
    const skills = Array.from(s.people.skill.subarray(0, 33));
    expect(skills.filter((x) => x === SKILL_CODE.miner)).toHaveLength(18);
    expect(skills.filter((x) => x === SKILL_CODE.technician)).toHaveLength(12);
    expect(skills.filter((x) => x === SKILL_CODE.engineer)).toHaveLength(3);
    expect(Array.from(s.people.home.subarray(0, 33)).every((h) => h === quarters(s).id)).toBe(true);
  });
});

describe('needs', () => {
  it('100 residents consume 84 kg O2, 300 kg water, 180 kg food per day (±1)', () => {
    const s = founded();
    for (let i = 33; i < 100; i++) {
      addWorker(s.people, { first: 0, last: 0, skill: 0, level: 1, home: quarters(s).id });
    }
    const depot = sectionState(s, home)!.depot;
    depot.oxygen = 1000;
    depot.potableWater = 1000;
    depot.hydroponicProduce = 1000;
    run(s, 1440);
    expect(Math.abs(1000 - depot.oxygen - 84)).toBeLessThanOrEqual(1);
    expect(Math.abs(1000 - depot.potableWater - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(1000 - depot.hydroponicProduce - 180)).toBeLessThanOrEqual(1);
    expect(sectionState(s, home)!.needsMet).toMatchObject({ air: 1, water: 1, food: 1 });
  });

  it('an empty food store means food is unmet and a shortage is reported', () => {
    const s = founded();
    const depot = sectionState(s, home)!.depot;
    delete depot.hydroponicProduce;
    const events = run(s, 2);
    expect(sectionState(s, home)!.needsMet.food).toBe(0);
    expect(events).toContainEqual({ t: 'shortage', sectionId: home, need: 'food', daysLeft: 0 });
  });
});

describe('morale', () => {
  it('targetMorale: crew quarters, all met, standard, short commute = 90', () => {
    expect(
      targetMorale({
        housingQuality: 5,
        met: { air: 1, water: 1, food: 1, power: 1 },
        wage: 'standard',
        unpaid: false,
        commuteMin: 30,
      }),
    ).toBe(90);
  });

  it('morale drifts 2 points per game hour', () => {
    const s = founded();
    s.people.morale[0] = 40;
    run(s, 60);
    expect(s.people.morale[0]).toBeCloseTo(42, 4);
  });
});

describe('strikes', () => {
  it('a crew under 25 morale for 6 hours strikes and returns at 35', () => {
    const s = founded();
    const garage = s.buildings.find((b) => b.type === 'roverGarage')!;
    // The idle crew joins the garage; the solar crews keep the grid up.
    for (let i = 0; i < s.people.count; i++) {
      if (s.people.job[i] === -1) s.people.job[i] = garage.id;
      if (s.people.job[i] === garage.id) s.people.morale[i] = 0;
    }
    expect(run(s, 360)).toContainEqual({ t: 'strike', buildingId: garage.id });
    expect(garage.status).toBe('striking');
    expect(run(s, 720)).toContainEqual({ t: 'strikeEnded', buildingId: garage.id });
    expect(garage.status).toBe('active');
  });
});

describe('housing', () => {
  it('demolishing housing moves residents to free housing; the rest leave', () => {
    const s = founded();
    const old = quarters(s);
    const plot = worldOf(s).plots.find(
      (p) =>
        p.sectionId === home && p.kind === 'build' && !s.buildings.some((b) => b.plotId === p.id),
    )!;
    expect(applyCommand(s, { t: 'build', plotId: plot.id, type: 'crewQuarters' })).toEqual({
      ok: true,
    });
    const fresh = s.buildings.find((b) => b.type === 'crewQuarters' && b.id !== old.id)!;
    fresh.status = 'active';
    fresh.progress = 1;
    expect(applyCommand(s, { t: 'demolish', buildingId: old.id })).toEqual({ ok: true });
    expect(s.people.count).toBe(33);
    expect(Array.from(s.people.home.subarray(0, 33)).every((h) => h === fresh.id)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
    expect(applyCommand(s, { t: 'demolish', buildingId: fresh.id })).toEqual({ ok: true });
    expect(s.people.count).toBe(0);
    expect(run(s, 1)).toContainEqual({ t: 'emigration', count: 33 });
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('migration', () => {
  it('arrivals only with free housing and morale ≥ 50', () => {
    const s = founded();
    run(s, 4320);
    expect(s.people.count).toBe(36); // crew quarters hold 36
    const low = founded();
    for (let i = 0; i < low.people.count; i++) low.people.morale[i] = 20;
    low.wageLevel = { miner: 'low', technician: 'low', engineer: 'low' };
    delete sectionState(low, home)!.depot.hydroponicProduce;
    run(low, 120);
    expect(low.people.count).toBeLessThanOrEqual(33);
  });

  it('emigration is seeded and deterministic', () => {
    const go = () => {
      const s = founded();
      for (let i = 0; i < s.people.count; i++) s.people.morale[i] = 0;
      delete sectionState(s, home)!.depot.oxygen;
      run(s, 600);
      return s.people.count;
    };
    expect(go()).toBe(go());
    expect(go()).toBeLessThan(33);
  });
});

describe('payroll', () => {
  it('10 miners cost LM 900 per game day; shortfall sets the flag', () => {
    const s = founded();
    s.people = createPeople();
    for (let i = 0; i < 10; i++) {
      addWorker(s.people, {
        first: 0,
        last: 0,
        skill: SKILL_CODE.miner,
        level: 1,
        home: quarters(s).id,
      });
    }
    expect(payrollCentsPerHour(s) * 24).toBe(90_000);
    const cash = balance(s.ledger, 'player');
    run(s, 60);
    // Migration can add a worker on the hour, before payroll runs: payroll pays the books as they stand.
    expect(cash - balance(s.ledger, 'player')).toBe(payrollCentsPerHour(s));
    transfer(s.ledger, 'player', 'world', balance(s.ledger, 'player'));
    run(s, 60);
    expect(s.payrollShortfall).toBe(true);
  });

  it('setWageLevel changes the wage', () => {
    const s = founded();
    expect(applyCommand(s, { t: 'setWageLevel', skill: 'miner', level: 'high' })).toEqual({
      ok: true,
    });
    expect(s.wageLevel.miner).toBe('high');
  });
});

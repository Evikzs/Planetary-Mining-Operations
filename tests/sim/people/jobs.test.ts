import { describe, expect, it } from 'vitest';
import {
  commuteProductivity,
  moraleProductivity,
  STOP_DWELL_MINUTES,
} from '../../../src/data/balance';
import type { BuildingTypeId, Skill } from '../../../src/data/buildings';
import { ROVER_SPEED } from '../../../src/shared/scale';
import { stopTimes, tripDuration, type Trip } from '../../../src/shared/trips';
import { plotRoute } from '../../../src/sim/build/routes';
import { gridFor, sectionState } from '../../../src/sim/build/sections';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import { seatCurrentShift } from '../../../src/sim/people/commute';
import {
  autoAssign,
  slotsPerShift,
  staffing,
  workforceProductivity,
} from '../../../src/sim/people/jobs';
import { addWorker, indexOfId, removeWorkerAt, SKILL_CODE } from '../../../src/sim/people/store';
import type { Building, GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';
import { cellOf, GRID_SIZE } from '../../../src/sim/world/roads';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const deposit = (good: string) =>
  world.plots.find((p) => p.sectionId === home && p.deposit?.goodId === good)!;

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function run(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) step(s, { mode: 'fine' });
}

/** Builds and finishes a building at once. */
function complete(s: GameState, plotId: number, type: BuildingTypeId): Building {
  expect(applyCommand(s, { t: 'build', plotId, type })).toEqual({ ok: true });
  const b = s.buildings.find((x) => x.plotId === plotId)!;
  b.status = 'active';
  b.progress = 1;
  return b;
}

const ofType = (s: GameState, type: BuildingTypeId) => s.buildings.find((b) => b.type === type)!;
const indices = (s: GameState) => [...Array(s.people.count).keys()];

/** Workers of one skill at a building, per shift. */
function crew(s: GameState, b: Building, skill: Skill): number[] {
  const p = s.people;
  return [0, 1, 2].map(
    (shift) =>
      indices(s).filter(
        (i) => p.job[i] === b.id && p.shift[i] === shift && p.skill[i] === SKILL_CODE[skill],
      ).length,
  );
}

/** Adds technicians who already hold a job on a shift, past the slot limit: trip tests only. */
function hire(s: GameState, n: number, job: Building, shift: number): void {
  for (let k = 0; k < n; k++) {
    const id = addWorker(s.people, {
      first: 0,
      last: 0,
      skill: SKILL_CODE.technician,
      level: 1,
      home: ofType(s, 'crewQuarters').id,
    });
    const i = indexOfId(s.people, id);
    s.people.job[i] = job.id;
    s.people.shift[i] = shift;
  }
}

const toWork = (s: GameState) => s.trips.filter((t) => t.kind === 'toWork');
const riders = (trips: Trip[]) => trips.flatMap((t) => t.stops.flatMap((x) => x.workerIds));
const ascending = (ids: number[]) => [...ids].sort((a, b) => a - b);
const returnOf = (t: Trip) =>
  Math.ceil(t.departTick + tripDuration(t) + t.stops.at(-1)!.s / t.speed);

describe('jobs', () => {
  it('fills a high-priority mine 4/4/4 from 12 miners before a normal one', () => {
    const s = founded();
    for (let k = 0; k < 6; k++) {
      const skills = Array.from(s.people.skill.subarray(0, s.people.count));
      removeWorkerAt(s.people, skills.indexOf(SKILL_CODE.miner));
    }
    const drill = complete(s, deposit('polarVolatiles').id, 'iceDrill');
    const mine = complete(s, deposit('ilmenite').id, 'mine');
    applyCommand(s, { t: 'setPriority', buildingId: mine.id, priority: 'high' });
    run(s, 1);
    expect(crew(s, mine, 'miner')).toEqual([4, 4, 4]);
    expect(crew(s, drill, 'miner')).toEqual([0, 0, 0]);
  });

  it('never moves locked workers', () => {
    const s = founded();
    const mine = complete(s, deposit('ilmenite').id, 'mine');
    const p = s.people;
    const miners = indices(s)
      .filter((i) => p.skill[i] === SKILL_CODE.miner)
      .map((i) => p.id[i]!);
    expect(
      applyCommand(s, {
        t: 'assignWorker',
        workerId: miners[0]!,
        buildingId: mine.id,
        shift: 1,
        lock: true,
      }),
    ).toEqual({ ok: true });
    expect(
      applyCommand(s, { t: 'assignWorker', workerId: miners[1]!, buildingId: null, lock: true }),
    ).toEqual({ ok: true });
    run(s, 1);
    applyCommand(s, { t: 'setPriority', buildingId: mine.id, priority: 'low' });
    run(s, 1);
    const a = indexOfId(p, miners[0]!);
    const b = indexOfId(p, miners[1]!);
    expect([p.job[a], p.shift[a], p.locked[a]]).toEqual([mine.id, 1, 1]);
    expect([p.job[b], p.locked[b]]).toEqual([-1, 1]);
    expect(crew(s, mine, 'miner').reduce((x, y) => x + y)).toBe(17);
  });

  it('demolishing a workplace frees and unlocks its workers', () => {
    const s = founded();
    const mine = complete(s, deposit('ilmenite').id, 'mine');
    const p = s.people;
    const miner = p.id[indices(s).find((i) => p.skill[i] === SKILL_CODE.miner)!]!;
    applyCommand(s, { t: 'assignWorker', workerId: miner, buildingId: mine.id, lock: true });
    run(s, 1);
    expect(applyCommand(s, { t: 'demolish', buildingId: mine.id })).toEqual({ ok: true });
    expect(Array.from(p.job.subarray(0, p.count))).not.toContain(mine.id);
    expect(p.locked[indexOfId(p, miner)]).toBe(0);
  });

  it('assignWorker refuses a wrong skill, a full shift and unknown ids', () => {
    const s = founded();
    const garage = ofType(s, 'roverGarage');
    const p = s.people;
    const miner = p.id[indices(s).find((i) => p.skill[i] === SKILL_CODE.miner)!]!;
    const freeTech =
      p.id[indices(s).find((i) => p.skill[i] === SKILL_CODE.technician && p.job[i] === -1)!]!;
    const noSlot = { ok: false, error: 'NO_OPEN_SLOT' };
    expect(
      applyCommand(s, { t: 'assignWorker', workerId: miner, buildingId: garage.id, lock: false }),
    ).toEqual(noSlot);
    expect(
      applyCommand(s, {
        t: 'assignWorker',
        workerId: freeTech,
        buildingId: garage.id,
        shift: 0,
        lock: false,
      }),
    ).toEqual(noSlot);
    expect(
      applyCommand(s, { t: 'assignWorker', workerId: 99_999, buildingId: garage.id, lock: false }),
    ).toEqual({ ok: false, error: 'UNKNOWN_ID' });
    expect(
      applyCommand(s, { t: 'assignWorker', workerId: freeTech, buildingId: 99_999, lock: false }),
    ).toEqual({ ok: false, error: 'UNKNOWN_ID' });
  });

  it('staffing counts the present crew of the current shift against the slots', () => {
    const s = founded();
    const mine = complete(s, deposit('ilmenite').id, 'mine');
    autoAssign(s);
    seatCurrentShift(s);
    expect(slotsPerShift(mine)).toEqual({ miner: 6, technician: 1 });
    expect(staffing(s, mine)).toBe(1);
    const p = s.people;
    const sent = indices(s)
      .filter((i) => p.job[i] === mine.id && p.present[i] === 1 && p.skill[i] === SKILL_CODE.miner)
      .slice(0, 3);
    for (const i of sent) p.present[i] = 0;
    run(s, 1);
    expect(staffing(s, mine)).toBeCloseTo(4 / 7, 12);
    mine.strike = true;
    expect(staffing(s, mine)).toBe(0);
  });

  it('workforce productivity is morale × commute productivity of the present crew', () => {
    const s = founded();
    const mine = complete(s, deposit('ilmenite').id, 'mine');
    autoAssign(s);
    seatCurrentShift(s);
    const p = s.people;
    const crewNow = indices(s).filter((i) => p.job[i] === mine.id && p.present[i] === 1);
    const road = plotRoute(s, home, ofType(s, 'crewQuarters').plotId, mine.plotId)!;
    for (const i of crewNow) {
      expect(p.commuteMin[i]).toBeCloseTo(road.length / ROVER_SPEED + STOP_DWELL_MINUTES, 4);
    }
    const morale = crewNow.reduce((sum, i) => sum + p.morale[i]!, 0) / crewNow.length;
    expect(workforceProductivity(s, mine)).toBeCloseTo(
      moraleProductivity(morale) * commuteProductivity(p.commuteMin[crewNow[0]!]!),
      9,
    );
    expect(workforceProductivity(s, ofType(s, 'crewQuarters'))).toBe(1);
  });

  it('commuteProductivity: 30 min → 0.95, 80 min → 0.7', () => {
    expect(commuteProductivity(30)).toBeCloseTo(0.95, 12);
    expect(commuteProductivity(80)).toBeCloseTo(0.7, 12);
  });
});

describe('commute', () => {
  it('first buses leave at 05:20 (tick 20) for the 06:00 shift', () => {
    const s = founded();
    run(s, 19);
    expect(toWork(s)).toHaveLength(0);
    run(s, 1);
    const trips = toWork(s);
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.every((t) => t.departTick === 20)).toBe(true);
    expect(riders(trips).every((id) => s.people.shift[indexOfId(s.people, id)] === 0)).toBe(true);
  });

  it('a bus carries ≤ 24 riders and ≤ 4 stops; each shift worker rides exactly one trip', () => {
    const s = founded();
    for (const b of s.buildings.filter((x) => x.type === 'solarArray' || x.type === 'roverGarage'))
      hire(s, 20, b, 0);
    run(s, 20);
    const trips = toWork(s);
    for (const t of trips) {
      expect(t.stops.length).toBeLessThanOrEqual(4);
      expect(t.stops.reduce((n, x) => n + x.workerIds.length, 0)).toBeLessThanOrEqual(24);
    }
    const rode = riders(trips);
    expect(new Set(rode).size).toBe(rode.length);
    const p = s.people;
    const due = indices(s)
      .filter((i) => p.shift[i] === 0 && p.job[i]! >= 0)
      .map((i) => p.id[i]!);
    expect(ascending(rode)).toEqual(ascending(due));
  });

  it('with 4 buses and 150 riders, the rest leave when buses come back', () => {
    const s = founded();
    hire(s, 150, ofType(s, 'roverGarage'), 0);
    run(s, 20);
    const trips = toWork(s);
    const now = trips.filter((t) => t.departTick === 20);
    const later = trips.filter((t) => t.departTick > 20);
    expect(now).toHaveLength(4);
    expect(later.length).toBeGreaterThanOrEqual(3);
    // Trips are planned in order, so each later bus is one an earlier trip brought back.
    const back = new Set(now.map(returnOf));
    for (const t of later) {
      expect(back).toContain(t.departTick);
      back.add(returnOf(t));
    }
  });

  it('trip points lie on road polylines', () => {
    const s = founded();
    complete(s, deposit('ilmenite').id, 'mine');
    autoAssign(s);
    run(s, 20);
    const g = gridFor(s, home);
    const roads = new Set(sectionState(s, home)!.roadNet!.roadCells);
    const nearRoad = (c: number) =>
      [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => roads.has(c + dy * GRID_SIZE + dx)));
    const points = s.trips.flatMap((t) => t.points);
    expect(points.length).toBeGreaterThan(0);
    for (const pt of points) {
      const c = cellOf(g, pt);
      expect(c !== null && nearRoad(c)).toBe(true);
    }
  });

  it('workers become present at their stop time', () => {
    const s = founded();
    run(s, 20);
    const trip = toWork(s)[0]!;
    const at = stopTimes(trip)[0]!;
    const present = () =>
      trip.stops[0]!.workerIds.map((id) => s.people.present[indexOfId(s.people, id)]);
    while (s.tick < Math.ceil(at) - 1) run(s, 1);
    expect(present().every((v) => v !== 1)).toBe(true);
    run(s, 1);
    expect(present().every((v) => v === 1)).toBe(true);
  });

  it('at shift end the off-going crew leaves work and rides home', () => {
    const s = founded();
    const p = s.people;
    const night = indices(s)
      .filter((i) => p.shift[i] === 2 && p.job[i]! >= 0)
      .map((i) => p.id[i]!);
    expect(night.length).toBeGreaterThan(0);
    run(s, 60);
    expect(night.every((id) => p.present[indexOfId(p, id)] === 0)).toBe(true);
    const homeward = riders(s.trips.filter((t) => t.kind === 'toHome'));
    expect(ascending(homeward)).toEqual(ascending(night));
  });

  it('coarse steps make no trips and seat the current shift', () => {
    const s = founded();
    run(s, 60);
    step(s, { mode: 'coarse' });
    expect(s.trips).toHaveLength(0);
    const p = s.people;
    for (const i of indices(s)) {
      expect(p.present[i]).toBe(p.job[i]! >= 0 && p.shift[i] === 0 ? 1 : 0);
    }
  });
});

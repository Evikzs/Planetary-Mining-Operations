import {
  BUS_CAPACITY,
  BUS_LEAD_MINUTES,
  levelBuses,
  MAX_STOPS,
  STOP_DWELL_MINUTES,
} from '../../data/balance';
import { ROVER_SPEED } from '../../shared/scale';
import { stopTimes, tripDuration, type Trip } from '../../shared/trips';
import { len, sub, type Vec3 } from '../../shared/vec3';
import { plotRoute } from '../build/routes';
import { shiftAt, shiftStartingAt } from '../clock';
import type { System } from '../engine';
import type { Building, GameState } from '../state';
import { worldOf } from '../world/luna';
import { forgetCrews } from './jobs';
import { indexOfId } from './store';

// present codes: 0 = away, 1 = at work, 2 = riding or waiting for a bus.

/** Every assigned worker of the current shift is at work and no bus is out. Coarse steps and founding. */
export function seatCurrentShift(state: GameState): void {
  const p = state.people;
  const shift = shiftAt(state.tick);
  for (let i = 0; i < p.count; i++) {
    p.present[i] = p.job[i]! >= 0 && p.home[i]! >= 0 && p.shift[i] === shift ? 1 : 0;
  }
  state.trips = [];
  forgetCrews(state);
}

type BusPool = GameState['buses'][number];

function busPool(state: GameState, sectionId: number): BusPool {
  let total = 0;
  for (const b of state.buildings) {
    if (b.sectionId === sectionId && b.type === 'roverGarage' && b.status !== 'constructing') {
      total += levelBuses(b.level);
    }
  }
  const pool = (state.buses[sectionId] ??= { total, busyUntil: [] });
  pool.total = total;
  // A demolished garage takes the buses that come back last.
  pool.busyUntil.sort((a, b) => a - b).splice(total);
  while (pool.busyUntil.length < total) pool.busyUntil.push(0);
  return pool;
}

/** Sends the first bus to come free; returns when it leaves. */
function takeBus(pool: BusPool, now: number, minutes: number): number {
  let k = 0;
  for (let j = 1; j < pool.busyUntil.length; j++) {
    if (pool.busyUntil[j]! < pool.busyUntil[k]!) k = j;
  }
  const depart = Math.max(now, pool.busyUntil[k]!);
  pool.busyUntil[k] = Math.ceil(depart + minutes);
  return depart;
}

interface Load {
  legs: { points: Vec3[] }[];
  stops: { buildingId: number; workerIds: number[] }[];
}

/**
 * Splits riders into bus loads: nearest stop first, at most 24 riders and 4 stops,
 * and a further stop only if the bus still reaches it within the lead time.
 */
function packLoads(state: GameState, origin: Building, groups: Map<Building, number[]>): Load[] {
  const left = new Map<Building, number[]>([...groups].map(([b, ids]) => [b, [...ids]]));
  const loads: Load[] = [];
  while (left.size) {
    const load: Load = { legs: [], stops: [] };
    let at = origin;
    let minutes = 0;
    let riders = 0;
    while (left.size && load.stops.length < MAX_STOPS && riders < BUS_CAPACITY) {
      let next: Building | null = null;
      let route: { points: Vec3[]; length: number } | null = null;
      for (const b of left.keys()) {
        const r = plotRoute(state, origin.sectionId, at.plotId, b.plotId);
        if (r && (!route || r.length < route.length)) {
          next = b;
          route = r;
        }
      }
      if (!next || !route) break;
      const arrive = minutes + route.length / ROVER_SPEED;
      if (load.stops.length && arrive > BUS_LEAD_MINUTES) break;
      const ids = left.get(next)!;
      const taken = ids.splice(0, BUS_CAPACITY - riders);
      if (!ids.length) left.delete(next);
      load.legs.push(route);
      load.stops.push({ buildingId: next.id, workerIds: taken });
      riders += taken.length;
      minutes = arrive + STOP_DWELL_MINUTES;
      at = next;
    }
    if (!load.stops.length) break; // no road reaches the rest
    loads.push(load);
  }
  return loads;
}

function makeTrip(state: GameState, sectionId: number, kind: Trip['kind'], load: Load): Trip {
  const radius = worldOf(state).radius;
  const points: Vec3[] = [];
  const cum: number[] = [];
  const stops: Trip['stops'] = [];
  load.legs.forEach((leg, k) => {
    for (const pt of points.length ? leg.points.slice(1) : leg.points) {
      const prev = points[points.length - 1];
      cum.push(prev ? cum[cum.length - 1]! + len(sub(pt, prev)) * radius : 0);
      points.push(pt);
    }
    stops.push({ s: cum[cum.length - 1]!, ...load.stops[k]!, dwell: STOP_DWELL_MINUTES });
  });
  return {
    id: state.nextTripId++,
    sectionId,
    departTick: 0,
    points,
    cum,
    stops,
    speed: ROVER_SPEED,
    kind,
  };
}

function dispatch(
  state: GameState,
  now: number,
  origin: Building,
  groups: Map<Building, number[]>,
  kind: Trip['kind'],
): void {
  const pool = busPool(state, origin.sectionId);
  if (!pool.total) return;
  const p = state.people;
  for (const load of packLoads(state, origin, groups)) {
    const trip = makeTrip(state, origin.sectionId, kind, load);
    const driveBack = trip.stops[trip.stops.length - 1]!.s / trip.speed;
    trip.departTick = takeBus(pool, now, tripDuration(trip) + driveBack);
    state.trips.push(trip);
    if (kind !== 'toWork') continue;
    for (const stop of trip.stops) for (const id of stop.workerIds) p.present[indexOfId(p, id)] = 2;
  }
}

/** origin building → stop building → worker ids, both levels in building id order. */
type Plan = Map<Building, Map<Building, number[]>>;

function addRider(plan: Plan, origin: Building, stop: Building, id: number): void {
  let stops = plan.get(origin);
  if (!stops) plan.set(origin, (stops = new Map<Building, number[]>()));
  let ids = stops.get(stop);
  if (!ids) stops.set(stop, (ids = []));
  ids.push(id);
}

function dispatchAll(state: GameState, now: number, plan: Plan, kind: Trip['kind']): void {
  const byId = (a: [Building, unknown], b: [Building, unknown]) => a[0].id - b[0].id;
  for (const [origin, stops] of [...plan].sort(byId)) {
    dispatch(state, now, origin, new Map([...stops].sort(byId)), kind);
  }
}

/** Workers of the shift due within the lead time who are not at work or on a bus. */
function planToWork(state: GameState, now: number): void {
  const p = state.people;
  const due = shiftAt(now + BUS_LEAD_MINUTES);
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const plan: Plan = new Map();
  for (let i = 0; i < p.count; i++) {
    if (p.present[i] !== 0 || p.shift[i] !== due || p.job[i]! < 0) continue;
    const home = byId.get(p.home[i]!);
    const job = byId.get(p.job[i]!);
    if (home && job && job.sectionId === home.sectionId) addRider(plan, home, job, p.id[i]!);
  }
  dispatchAll(state, now, plan, 'toWork');
}

/** The ending shift leaves work; those who were there ride home. */
function sendHome(state: GameState, now: number, ending: number): void {
  const p = state.people;
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const plan: Plan = new Map();
  for (let i = 0; i < p.count; i++) {
    if (p.shift[i] !== ending || p.present[i] === 0) continue;
    const wasAtWork = p.present[i] === 1;
    p.present[i] = 0;
    const job = byId.get(p.job[i]!);
    const home = byId.get(p.home[i]!);
    if (wasAtWork && job && home) addRider(plan, job, home, p.id[i]!);
  }
  dispatchAll(state, now, plan, 'toHome');
}

/** Riders reach work when their bus reaches their stop. */
function arrive(state: GameState, now: number): void {
  const p = state.people;
  for (const trip of state.trips) {
    if (trip.kind !== 'toWork') continue;
    stopTimes(trip).forEach((at, k) => {
      if (at <= now - 1 || at > now) return;
      const stop = trip.stops[k]!;
      for (const id of stop.workerIds) {
        const i = indexOfId(p, id);
        if (i >= 0 && p.present[i] === 2 && p.job[i] === stop.buildingId) p.present[i] = 1;
      }
    });
  }
}

export const commuteSystem: System = {
  id: 'commute',
  step(state, ctx) {
    if (ctx.mode === 'coarse') {
      seatCurrentShift(state);
      return;
    }
    const now = state.tick;
    const starting = shiftStartingAt(now);
    if (starting !== null) sendHome(state, now, (starting + 2) % 3);
    planToWork(state, now);
    arrive(state, now);
    state.trips = state.trips.filter((t) => now <= t.departTick + tripDuration(t) + 1);
    forgetCrews(state);
  },
};

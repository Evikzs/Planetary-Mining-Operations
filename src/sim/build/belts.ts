import { BELT_CAPACITY_TPH, levelOutput } from '../../data/balance';
import type { GoodId } from '../../data/goods';
import { BELT_SPEED } from '../../shared/scale';
import { add, scale, angleBetween, type Vec3 } from '../../shared/vec3';
import type { StepContext, System } from '../engine';
import { add as addKg, take, totalKg, type Inventory } from '../inventory';
import { newId, type Building, type GameState } from '../state';
import { worldOf } from '../world/luna';
import { inputTargetsKg } from './buffers';
import { hubDir, sectionState, storageCapKg } from './sections';

export interface Batch {
  enterTick: number;
  arriveTick: number;
  goodId: GoodId;
  kg: number;
}

export interface Lane {
  batches: Batch[];
  jammed: boolean;
}

export interface Belt {
  id: number;
  buildingId: number;
  sectionId: number;
  points: Vec3[];
  length: number;
  transitTicks: number;
  out: Lane;
  in: Lane;
}

export function beltCapacityKgPerTick(level: number): number {
  return Math.round((BELT_CAPACITY_TPH * levelOutput(level) * 1000) / 60);
}

function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const theta = angleBetween(a, b);
  if (theta < 1e-12) return a;
  const s = Math.sin(theta);
  return add(scale(a, Math.sin((1 - t) * theta) / s), scale(b, Math.sin(t * theta) / s));
}

export function createBelt(state: GameState, building: Building): Belt {
  const world = worldOf(state);
  const from = world.plots[building.plotId]!.dir;
  const to = hubDir(state, building.sectionId);
  const length = angleBetween(from, to) * world.radius;
  const n = Math.max(1, Math.ceil(length / 0.2));
  const points = Array.from({ length: n + 1 }, (_, i) =>
    i === 0 ? from : i === n ? to : slerp(from, to, i / n),
  );
  const belt: Belt = {
    id: newId(state),
    buildingId: building.id,
    sectionId: building.sectionId,
    points,
    length,
    transitTicks: Math.max(1, Math.ceil(length / BELT_SPEED)),
    out: { batches: [], jammed: false },
    in: { batches: [], jammed: false },
  };
  state.belts.push(belt);
  building.beltId = belt.id;
  return belt;
}

/** Removes a building's belt; goods on it go to the depot while there is space. */
export function removeBelt(state: GameState, building: Building): void {
  const belt = state.belts.find((b) => b.id === building.beltId);
  if (!belt) return;
  const depot = sectionState(state, belt.sectionId)!.depot;
  for (const batch of [...belt.out.batches, ...belt.in.batches]) {
    const free = Math.max(0, storageCapKg(state, belt.sectionId) - totalKg(depot));
    addKg(depot, batch.goodId, Math.min(batch.kg, free));
  }
  state.belts = state.belts.filter((b) => b.id !== belt.id);
  building.beltId = null;
}

const inTransit = (lane: Lane, g: GoodId) =>
  lane.batches.reduce((sum, b) => (b.goodId === g ? sum + b.kg : sum), 0);

/** Goods sorted by amount, largest first, ties by id: deterministic. */
function largestFirst(entries: [GoodId, number][]): [GoodId, number][] {
  return entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

interface Ends {
  space(g: GoodId): number;
  put(g: GoodId, kg: number): void;
}

function ends(state: GameState, belt: Belt, b: Building, lane: 'out' | 'in'): Ends {
  const depot = sectionState(state, belt.sectionId)!.depot;
  if (lane === 'out') {
    return {
      space: () => Math.max(0, storageCapKg(state, belt.sectionId) - totalKg(depot)),
      put: (g, kg) => addKg(depot, g, kg),
    };
  }
  const targets = inputTargetsKg(b);
  return {
    space: (g) => Math.max(0, (targets[g] ?? 0) - (b.input[g] ?? 0)),
    put: (g, kg) => addKg(b.input, g, kg),
  };
}

/** Delivers due batches (all of them when `all`), partially where space allows. */
function deliver(lane: Lane, dest: Ends, tick: number, all: boolean): boolean {
  while (lane.batches.length) {
    const head = lane.batches[0]!;
    if (!all && head.arriveTick > tick) return false;
    const moved = Math.min(head.kg, dest.space(head.goodId));
    if (moved > 0) dest.put(head.goodId, moved);
    head.kg -= moved;
    if (head.kg > 0) return true;
    lane.batches.shift();
  }
  return false;
}

/** What a lane should load next: [good, kg available to send]. */
function nextLoad(
  state: GameState,
  belt: Belt,
  b: Building,
  lane: 'out' | 'in',
): [GoodId, number][] {
  if (lane === 'out') return largestFirst(Object.entries(b.output) as [GoodId, number][]);
  const depot = sectionState(state, belt.sectionId)!.depot;
  const targets = inputTargetsKg(b);
  return largestFirst(
    (Object.entries(targets) as [GoodId, number][]).map(([g, target]) => [
      g,
      Math.min(depot[g] ?? 0, Math.max(0, target - (b.input[g] ?? 0) - inTransit(belt.in, g))),
    ]),
  );
}

function source(state: GameState, belt: Belt, b: Building, lane: 'out' | 'in'): Inventory {
  return lane === 'out' ? b.output : sectionState(state, belt.sectionId)!.depot;
}

function stepLane(state: GameState, belt: Belt, b: Building, lane: 'out' | 'in', ctx: StepContext) {
  const l = belt[lane];
  const dest = ends(state, belt, b, lane);
  const wasJammed = l.jammed;
  const cap = beltCapacityKgPerTick(b.level);
  if (ctx.mode === 'fine') {
    l.jammed = deliver(l, dest, state.tick, false);
    if (!l.jammed && l.batches.length < belt.transitTicks + 1) {
      const [load] = nextLoad(state, belt, b, lane);
      if (load) {
        const kg = Math.min(cap, load[1]);
        take(source(state, belt, b, lane), load[0], kg);
        l.batches.push({
          enterTick: state.tick,
          arriveTick: state.tick + belt.transitTicks,
          goodId: load[0],
          kg,
        });
      }
    }
  } else {
    l.jammed = deliver(l, dest, state.tick, true);
    let budget = cap * ctx.dtMinutes;
    if (!l.jammed) {
      for (const [g, available] of nextLoad(state, belt, b, lane)) {
        const kg = Math.min(budget, available, dest.space(g));
        if (kg <= 0) continue;
        take(source(state, belt, b, lane), g, kg);
        dest.put(g, kg);
        budget -= kg;
      }
      l.jammed = lane === 'out' && totalKg(b.output) > 0 && dest.space('regolith') === 0;
    }
  }
  if (l.jammed && !wasJammed) ctx.events.push({ t: 'beltJammed', beltId: belt.id });
}

export const beltsSystem: System = {
  id: 'belts',
  step(state, ctx) {
    for (const belt of state.belts) {
      const b = state.buildings.find((x) => x.id === belt.buildingId);
      if (!b || b.status === 'constructing' || b.status === 'upgrading') continue;
      stepLane(state, belt, b, 'out', ctx);
      stepLane(state, belt, b, 'in', ctx);
    }
  },
};

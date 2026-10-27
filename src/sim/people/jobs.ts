import {
  commuteProductivity,
  levelJobs,
  moraleProductivity,
  STOP_DWELL_MINUTES,
} from '../../data/balance';
import { BUILDINGS, type Skill } from '../../data/buildings';
import { ROVER_SPEED } from '../../shared/scale';
import { plotRoute } from '../build/routes';
import { shiftAt } from '../clock';
import { fail, OK, type Command, type CommandResult } from '../commands';
import type { System } from '../engine';
import type { Building, GameState, Priority } from '../state';
import { indexOfId, SKILL_CODE, SKILL_OF } from './store';

/** Job slots per shift at the building's level. */
export function slotsPerShift(b: Building): Partial<Record<Skill, number>> {
  const slots: Partial<Record<Skill, number>> = {};
  for (const [skill, n] of Object.entries(BUILDINGS[b.type].jobs) as [Skill, number][]) {
    slots[skill] = levelJobs(b.level, n);
  }
  return slots;
}

interface Crew {
  bySkill: Record<Skill, number>;
  moraleSum: number;
  commuteSum: number;
  n: number;
}

// Present crews per building for one tick; the commute system drops it when presence changes.
const crewCache = new WeakMap<GameState, { tick: number; crews: Map<number, Crew> }>();

export const forgetCrews = (state: GameState) => crewCache.delete(state);

function crews(state: GameState): Map<number, Crew> {
  const hit = crewCache.get(state);
  if (hit?.tick === state.tick) return hit.crews;
  const p = state.people;
  const shift = shiftAt(state.tick);
  const byBuilding = new Map<number, Crew>();
  for (let i = 0; i < p.count; i++) {
    if (p.present[i] !== 1 || p.shift[i] !== shift) continue;
    const job = p.job[i]!;
    let crew = byBuilding.get(job);
    if (!crew) {
      crew = {
        bySkill: { miner: 0, technician: 0, engineer: 0 },
        moraleSum: 0,
        commuteSum: 0,
        n: 0,
      };
      byBuilding.set(job, crew);
    }
    crew.bySkill[SKILL_OF[p.skill[i]!]!]++;
    crew.moraleSum += p.morale[i]!;
    crew.commuteSum += p.commuteMin[i]!;
    crew.n++;
  }
  crewCache.set(state, { tick: state.tick, crews: byBuilding });
  return byBuilding;
}

/** Share of this shift's job slots filled by workers at work, 0..1. A struck building has none. */
export function staffing(state: GameState, building: Building): number {
  if (building.strike) return 0;
  const crew = crews(state).get(building.id);
  let need = 0;
  let have = 0;
  for (const [skill, n] of Object.entries(slotsPerShift(building)) as [Skill, number][]) {
    need += n;
    have += Math.min(crew?.bySkill[skill] ?? 0, n);
  }
  return need === 0 ? 1 : have / need;
}

/** Morale × commute productivity of the crew at work. */
export function workforceProductivity(state: GameState, building: Building): number {
  const crew = crews(state).get(building.id);
  if (!crew) return 1;
  return (
    moraleProductivity(crew.moraleSum / crew.n) * commuteProductivity(crew.commuteSum / crew.n)
  );
}

const RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

/**
 * Fills open slots with unemployed, unlocked workers of the same section: high priority first,
 * then building id; each worker joins the least-filled shift. Employed workers never move.
 */
export function autoAssign(state: GameState): void {
  const p = state.people;
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  // Filled slots per building, indexed shift × 3 + skill code.
  const filled = new Map<number, number[]>();
  const fillOf = (id: number) => {
    let f = filled.get(id);
    if (!f) filled.set(id, (f = [0, 0, 0, 0, 0, 0, 0, 0, 0]));
    return f;
  };
  const pools = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    if (p.job[i]! >= 0) {
      const f = fillOf(p.job[i]!);
      const k = p.shift[i]! * 3 + p.skill[i]!;
      f[k] = f[k]! + 1;
      continue;
    }
    const sectionId = byId.get(p.home[i]!)?.sectionId;
    if (p.locked[i] || sectionId === undefined) continue;
    const key = `${sectionId}:${p.skill[i]}`;
    let pool = pools.get(key);
    if (!pool) pools.set(key, (pool = []));
    pool.push(i);
  }
  for (const pool of pools.values()) pool.reverse(); // pop() hands out the lowest index first

  const order = state.buildings
    .filter((b) => b.status !== 'constructing')
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.id - b.id);
  for (const b of order) {
    const f = fillOf(b.id);
    for (const [skill, n] of Object.entries(slotsPerShift(b)) as [Skill, number][]) {
      const code = SKILL_CODE[skill];
      const pool = pools.get(`${b.sectionId}:${code}`);
      while (pool?.length) {
        let best = -1;
        for (let shift = 0; shift < 3; shift++) {
          const have = f[shift * 3 + code]!;
          if (have < n && (best < 0 || have < f[best * 3 + code]!)) best = shift;
        }
        if (best < 0) break;
        const i = pool.pop()!;
        p.job[i] = b.id;
        p.shift[i] = best;
        f[best * 3 + code] = f[best * 3 + code]! + 1;
      }
    }
  }

  for (let i = 0; i < p.count; i++) {
    const job = byId.get(p.job[i]!);
    const home = byId.get(p.home[i]!);
    const route = job && home ? plotRoute(state, job.sectionId, home.plotId, job.plotId) : null;
    p.commuteMin[i] = route ? route.length / ROVER_SPEED + STOP_DWELL_MINUTES : 0;
  }
  state.jobsDirty = false;
}

export function assignWorker(
  state: GameState,
  cmd: Extract<Command, { t: 'assignWorker' }>,
): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const p = state.people;
  const i = indexOfId(p, cmd.workerId);
  if (i < 0) return fail('UNKNOWN_ID');
  let job = -1;
  let shift: number = p.shift[i]!;
  if (cmd.buildingId !== null) {
    const b = state.buildings.find((x) => x.id === cmd.buildingId);
    if (!b) return fail('UNKNOWN_ID');
    const need = slotsPerShift(b)[SKILL_OF[p.skill[i]!]!] ?? 0;
    const home = state.buildings.find((x) => x.id === p.home[i]);
    if (!need || b.status === 'constructing' || home?.sectionId !== b.sectionId) {
      return fail('NO_OPEN_SLOT');
    }
    const fill = [0, 0, 0];
    for (let j = 0; j < p.count; j++) {
      if (j !== i && p.job[j] === b.id && p.skill[j] === p.skill[i]) {
        fill[p.shift[j]!] = fill[p.shift[j]!]! + 1;
      }
    }
    shift = cmd.shift ?? 0;
    if (cmd.shift === undefined) for (const s of [1, 2]) if (fill[s]! < fill[shift]!) shift = s;
    if (fill[shift]! >= need) return fail('NO_OPEN_SLOT');
    job = b.id;
  }
  if (p.job[i] !== job || p.shift[i] !== shift) p.present[i] = 0;
  p.job[i] = job;
  p.shift[i] = shift;
  p.locked[i] = cmd.lock ? 1 : 0;
  state.jobsDirty = true;
  return OK;
}

/** A demolished workplace lets its workers go: they are free to be placed again. */
export function releaseWorkers(state: GameState, buildingId: number): void {
  const p = state.people;
  for (let i = 0; i < p.count; i++) {
    if (p.job[i] !== buildingId) continue;
    p.job[i] = -1;
    p.locked[i] = 0;
    p.present[i] = 0;
  }
  state.jobsDirty = true;
}

export const jobsSystem: System = {
  id: 'jobs',
  step(state) {
    if (state.jobsDirty || state.tick % 60 === 0) autoAssign(state);
  },
};

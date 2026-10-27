import { FIRST_NAMES, LAST_NAMES } from '../../data/names';
import type { Skill } from '../../data/buildings';

export const SKILL_CODE: Record<Skill, number> = { miner: 0, technician: 1, engineer: 2 };
export const SKILL_OF: Skill[] = ['miner', 'technician', 'engineer'];

/** Workers as parallel typed arrays (structure of arrays). Only the first `count` slots are live. */
export interface People {
  count: number;
  nextId: number;
  id: Uint32Array;
  first: Uint16Array;
  last: Uint16Array;
  skill: Uint8Array;
  level: Uint8Array;
  /** Housing building id, or -1. */
  home: Int32Array;
  /** Workplace building id, or -1. */
  job: Int32Array;
  shift: Uint8Array;
  locked: Uint8Array;
  morale: Float32Array;
  present: Uint8Array;
  commuteMin: Float32Array;
}

type ArrayKey = Exclude<keyof People, 'count' | 'nextId'>;
const ARRAYS: ArrayKey[] = [
  'id',
  'first',
  'last',
  'skill',
  'level',
  'home',
  'job',
  'shift',
  'locked',
  'morale',
  'present',
  'commuteMin',
];

export function createPeople(capacity = 64): People {
  return {
    count: 0,
    nextId: 1,
    id: new Uint32Array(capacity),
    first: new Uint16Array(capacity),
    last: new Uint16Array(capacity),
    skill: new Uint8Array(capacity),
    level: new Uint8Array(capacity),
    home: new Int32Array(capacity).fill(-1),
    job: new Int32Array(capacity).fill(-1),
    shift: new Uint8Array(capacity),
    locked: new Uint8Array(capacity),
    morale: new Float32Array(capacity),
    present: new Uint8Array(capacity),
    commuteMin: new Float32Array(capacity),
  };
}

function grow(p: People): void {
  const bigger = createPeople(Math.max(64, p.id.length * 2));
  for (const key of ARRAYS) (bigger[key] as Uint32Array).set(p[key]);
  for (const key of ARRAYS) (p as unknown as Record<string, unknown>)[key] = bigger[key];
}

const indexCache = new WeakMap<People, Map<number, number>>();

export function addWorker(
  p: People,
  w: { first: number; last: number; skill: number; level: number; home: number; morale?: number },
): number {
  if (p.count === p.id.length) grow(p);
  const i = p.count++;
  const id = p.nextId++;
  p.id[i] = id;
  p.first[i] = w.first;
  p.last[i] = w.last;
  p.skill[i] = w.skill;
  p.level[i] = w.level;
  p.home[i] = w.home;
  p.job[i] = -1;
  p.shift[i] = 0;
  p.locked[i] = 0;
  p.morale[i] = w.morale ?? 60;
  p.present[i] = 0;
  p.commuteMin[i] = 0;
  indexCache.get(p)?.set(id, i);
  return id;
}

/** Removes the worker at index i by moving the last worker into its slot. */
export function removeWorkerAt(p: People, i: number): void {
  const last = p.count - 1;
  if (i !== last) for (const key of ARRAYS) p[key][i] = p[key][last]!;
  p.home[last] = -1;
  p.job[last] = -1;
  p.count--;
  indexCache.delete(p);
}

export function indexOfId(p: People, id: number): number {
  let map = indexCache.get(p);
  if (!map) {
    map = new Map();
    for (let i = 0; i < p.count; i++) map.set(p.id[i]!, i);
    indexCache.set(p, map);
  }
  return map.get(id) ?? -1;
}

export function workerName(p: People, i: number): string {
  return `${FIRST_NAMES[p.first[i]!] ?? ''} ${LAST_NAMES[p.last[i]!] ?? ''}`;
}

import { BUILDINGS } from '../../data/buildings';
import { levelOutput } from '../../data/balance';
import type { Building, GameState } from '../state';
import { removeWorkerAt } from './store';

const ready = (b: Building) => b.status !== 'constructing';

export function housingCapacity(b: Building): number {
  const h = BUILDINGS[b.type].housing;
  return h && ready(b) ? Math.floor(h.capacity * levelOutput(b.level)) : 0;
}

/** Residents per housing building id. */
export function residentsByHome(state: GameState): Map<number, number> {
  const map = new Map<number, number>();
  const p = state.people;
  for (let i = 0; i < p.count; i++) {
    const h = p.home[i]!;
    if (h >= 0) map.set(h, (map.get(h) ?? 0) + 1);
  }
  return map;
}

/** Residents per section id. */
export function residentsBySection(state: GameState): Map<number, number> {
  const sectionOf = new Map(state.buildings.map((b) => [b.id, b.sectionId]));
  const map = new Map<number, number>();
  for (const [home, n] of residentsByHome(state)) {
    const sid = sectionOf.get(home);
    if (sid !== undefined) map.set(sid, (map.get(sid) ?? 0) + n);
  }
  return map;
}

/** Moves a housing building's residents to free housing in its section. Returns how many had to leave. */
export function evictResidents(state: GameState, from: Building): number {
  const p = state.people;
  const byHome = residentsByHome(state);
  const others = state.buildings.filter(
    (b) => b.id !== from.id && b.sectionId === from.sectionId && housingCapacity(b) > 0,
  );
  let left = 0;
  for (let i = p.count - 1; i >= 0; i--) {
    if (p.home[i] !== from.id) continue;
    const to = others.find((b) => housingCapacity(b) > (byHome.get(b.id) ?? 0));
    if (to) {
      p.home[i] = to.id;
      byHome.set(to.id, (byHome.get(to.id) ?? 0) + 1);
    } else {
      removeWorkerAt(p, i);
      left++;
    }
  }
  return left;
}

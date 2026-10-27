import { BUILDINGS, SKILLS, type Skill } from '../../data/buildings';
import { levelJobs, migrationPerDay, MORALE } from '../../data/balance';
import type { StepContext, System } from '../engine';
import type { GameState } from '../state';
import { housingCapacity, residentsByHome } from './housing';
import { addWorker, removeWorkerAt, SKILL_CODE } from './store';

const isHour = (state: GameState) => state.tick % 60 === 0;

/** The skill whose job slots are least filled; ties go miner, technician, engineer. */
export function arrivalSkill(state: GameState): Skill {
  const slots: Record<Skill, number> = { miner: 0, technician: 0, engineer: 0 };
  for (const b of state.buildings) {
    for (const [skill, n] of Object.entries(BUILDINGS[b.type].jobs)) {
      slots[skill as Skill] += levelJobs(b.level, n) * 3;
    }
  }
  const filled: Record<Skill, number> = { miner: 0, technician: 0, engineer: 0 };
  const p = state.people;
  for (let i = 0; i < p.count; i++) filled[SKILLS[p.skill[i]!]!]++;
  let best: Skill = 'miner';
  let bestRatio = -Infinity;
  for (const skill of SKILLS) {
    const ratio = slots[skill] === 0 ? -1 : (slots[skill] - filled[skill]) / slots[skill];
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = skill;
    }
  }
  return best;
}

function emigrate(state: GameState, ctx: StepContext): void {
  const p = state.people;
  let left = 0;
  for (let i = p.count - 1; i >= 0; i--) {
    if (p.morale[i]! < MORALE.emigrateBelow && ctx.rng.next() < MORALE.emigrateChancePerHour) {
      removeWorkerAt(p, i);
      left++;
    }
  }
  if (left) ctx.events.push({ t: 'emigration', count: left });
}

function arrive(state: GameState, ctx: StepContext): void {
  const p = state.people;
  const byHome = residentsByHome(state);
  for (const section of state.sections) {
    const homes = state.buildings.filter(
      (b) => b.sectionId === section.id && housingCapacity(b) > 0,
    );
    let free = homes.reduce((n, b) => n + housingCapacity(b) - (byHome.get(b.id) ?? 0), 0);
    if (free <= 0) continue;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < p.count; i++) {
      if (homes.some((b) => b.id === p.home[i])) {
        sum += p.morale[i]!;
        n++;
      }
    }
    if ((n ? sum / n : 60) < MORALE.migrateMinMorale) continue;
    let arrivals = Math.min(free, Math.floor(migrationPerDay(n) / 24 + ctx.rng.next()));
    const count = arrivals;
    while (arrivals-- > 0 && free-- > 0) {
      const home = homes.find((b) => housingCapacity(b) > (byHome.get(b.id) ?? 0))!;
      byHome.set(home.id, (byHome.get(home.id) ?? 0) + 1);
      addWorker(p, {
        first: ctx.rng.int(0, 159),
        last: ctx.rng.int(0, 159),
        skill: SKILL_CODE[arrivalSkill(state)],
        level: 1,
        home: home.id,
      });
    }
    if (count > 0) ctx.events.push({ t: 'arrivals', sectionId: section.id, count });
  }
}

export const migrationSystem: System = {
  id: 'migration',
  step(state, ctx) {
    if (!isHour(state)) return;
    emigrate(state, ctx);
    arrive(state, ctx);
  },
};

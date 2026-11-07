import { SKILLS, type Skill } from '../../data/buildings';
import { migrationPerDay, MORALE } from '../../data/balance';
import type { StepContext, System } from '../engine';
import type { GameState } from '../state';
import { housingCapacity, residentsByHome } from './housing';
import { slotsPerShift } from './jobs';
import { addWorker, removeWorkerAt, SKILL_CODE } from './store';
import { ownersByBuilding, PLAYER, type CompanyId } from '../companies';

const isHour = (state: GameState) => state.tick % 60 === 0;

type SkillCounts = { slots: Record<Skill, number>; filled: Record<Skill, number> };

/** Job slots over all three shifts at one company, contract sites' included, and its workers. */
function skillCounts(state: GameState, co: CompanyId): SkillCounts {
  const owners = ownersByBuilding(state);
  const slots: Record<Skill, number> = { miner: 0, technician: 0, engineer: 0 };
  for (const b of state.buildings) {
    if (owners.get(b.id) !== co) continue;
    for (const [skill, n] of Object.entries(slotsPerShift(b)) as [Skill, number][]) {
      slots[skill] += n * 3;
    }
  }
  const filled: Record<Skill, number> = { miner: 0, technician: 0, engineer: 0 };
  const p = state.people;
  for (let i = 0; i < p.count; i++) {
    if (owners.get(p.home[i]!) === co) filled[SKILLS[p.skill[i]!]!]++;
  }
  return { slots, filled };
}

/** The least filled skill; ties go miner, technician, engineer. */
function neediest({ slots, filled }: SkillCounts): Skill {
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

/**
 * The skill whose job slots at one company, contract sites' included, are least filled; ties go
 * miner, technician, engineer.
 */
export const arrivalSkill = (state: GameState, co: CompanyId = PLAYER): Skill =>
  neediest(skillCounts(state, co));

function emigrate(state: GameState, ctx: StepContext): void {
  const p = state.people;
  const owners = ownersByBuilding(state);
  const left = new Map<CompanyId, number>();
  for (let i = p.count - 1; i >= 0; i--) {
    if (p.morale[i]! < MORALE.emigrateBelow && ctx.rng.next() < MORALE.emigrateChancePerHour) {
      const co = owners.get(p.home[i]!) ?? PLAYER;
      removeWorkerAt(p, i);
      left.set(co, (left.get(co) ?? 0) + 1);
    }
  }
  if (!left.size) return;
  for (const [companyId, count] of [...left].sort((a, b) => a[0] - b[0])) {
    ctx.events.push({ t: 'emigration', companyId, count });
  }
  state.jobsDirty = true;
}

function arrive(state: GameState, ctx: StepContext): void {
  const p = state.people;
  const byHome = residentsByHome(state);
  // Residents' morale per section, summed in people order, in one pass.
  const housingSection = new Map(
    state.buildings.filter((b) => housingCapacity(b) > 0).map((b) => [b.id, b.sectionId]),
  );
  const morale = new Map<number, { sum: number; n: number }>();
  for (let i = 0; i < p.count; i++) {
    const sid = housingSection.get(p.home[i]!);
    if (sid === undefined) continue;
    const m = morale.get(sid) ?? { sum: 0, n: 0 };
    m.sum += p.morale[i]!;
    m.n++;
    morale.set(sid, m);
  }
  // Each company's skill counts, kept up to date as arrivals take their skills.
  const counts = new Map<CompanyId, SkillCounts>();
  for (const section of state.sections) {
    const homes = state.buildings.filter(
      (b) => b.sectionId === section.id && housingCapacity(b) > 0,
    );
    let free = homes.reduce((n, b) => n + housingCapacity(b) - (byHome.get(b.id) ?? 0), 0);
    if (free <= 0) continue;
    const { sum, n } = morale.get(section.id) ?? { sum: 0, n: 0 };
    if ((n ? sum / n : 60) < MORALE.migrateMinMorale) continue;
    let arrivals = Math.min(free, Math.floor(migrationPerDay(n) / 24 + ctx.rng.next()));
    const count = arrivals;
    while (arrivals-- > 0 && free-- > 0) {
      const home = homes.find((b) => housingCapacity(b) > (byHome.get(b.id) ?? 0))!;
      byHome.set(home.id, (byHome.get(home.id) ?? 0) + 1);
      let c = counts.get(section.owner);
      if (!c) counts.set(section.owner, (c = skillCounts(state, section.owner)));
      const skill = neediest(c);
      c.filled[skill]++;
      addWorker(p, {
        first: ctx.rng.int(0, 159),
        last: ctx.rng.int(0, 159),
        skill: SKILL_CODE[skill],
        level: 1,
        home: home.id,
      });
    }
    if (count === 0) continue;
    ctx.events.push({ t: 'arrivals', sectionId: section.id, count, companyId: section.owner });
    state.jobsDirty = true;
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

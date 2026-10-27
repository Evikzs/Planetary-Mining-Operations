import { BUILDINGS } from '../../data/buildings';
import { MORALE, WAGE_LEVEL, type WageLevel } from '../../data/balance';
import type { System } from '../engine';
import type { GameState } from '../state';
import { ALL_MET, type NeedsMet } from './needs';
import { SKILL_OF } from './store';

export function targetMorale(input: {
  housingQuality: number;
  met: NeedsMet;
  wage: WageLevel;
  unpaid: boolean;
  commuteMin: number;
}): number {
  const m = input.met;
  const t =
    MORALE.base +
    input.housingQuality +
    MORALE.air * m.air +
    MORALE.water * m.water +
    MORALE.food * m.food +
    MORALE.power * m.power +
    WAGE_LEVEL[input.wage].morale +
    (input.unpaid ? MORALE.unpaid : 0) +
    (input.commuteMin > MORALE.longCommuteMin ? MORALE.longCommute : 0);
  return Math.min(100, Math.max(0, t));
}

/** Average morale of the workers assigned to each building. */
export function moraleByJob(state: GameState): Map<number, { sum: number; n: number }> {
  const p = state.people;
  const map = new Map<number, { sum: number; n: number }>();
  for (let i = 0; i < p.count; i++) {
    const job = p.job[i]!;
    if (job < 0) continue;
    const e = map.get(job) ?? { sum: 0, n: 0 };
    e.sum += p.morale[i]!;
    e.n++;
    map.set(job, e);
  }
  return map;
}

export const moraleSystem: System = {
  id: 'morale',
  step(state, ctx) {
    const home = new Map(
      state.buildings.map((b) => [
        b.id,
        {
          quality: BUILDINGS[b.type].housing?.quality ?? 0,
          met: state.sections.find((s) => s.id === b.sectionId)?.needsMet ?? ALL_MET,
        },
      ]),
    );
    const step = (MORALE.driftPerHour * ctx.dtMinutes) / 60;
    const p = state.people;
    for (let i = 0; i < p.count; i++) {
      const h = home.get(p.home[i]!);
      const target = targetMorale({
        housingQuality: h?.quality ?? 0,
        met: h?.met ?? ALL_MET,
        wage: state.wageLevel[SKILL_OF[p.skill[i]!]!],
        unpaid: state.payrollShortfall,
        commuteMin: p.commuteMin[i]!,
      });
      const m = p.morale[i]!;
      p.morale[i] = m + Math.max(-step, Math.min(step, target - m));
    }
    // Strikes: a workplace whose crew stays unhappy for 6 hours walks out.
    const byJob = moraleByJob(state);
    for (const b of state.buildings) {
      const e = byJob.get(b.id);
      if (!e) continue;
      const avg = e.sum / e.n;
      b.lowMoraleMinutes = avg < MORALE.strikeBelow ? b.lowMoraleMinutes + ctx.dtMinutes : 0;
      if (!b.strike && b.lowMoraleMinutes >= MORALE.strikeHours * 60) {
        b.strike = true;
        ctx.events.push({ t: 'strike', buildingId: b.id });
      } else if (b.strike && avg >= MORALE.strikeResume) {
        b.strike = false;
        ctx.events.push({ t: 'strikeEnded', buildingId: b.id });
      }
    }
  },
};

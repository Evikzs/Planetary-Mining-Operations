import { BUILDINGS } from '../../data/buildings';
import { MORALE, WAGE_LEVEL, type WageLevel } from '../../data/balance';
import type { System } from '../engine';
import { ALL_MET, type NeedsMet } from './needs';
import { SKILL_OF } from './store';

/** The part of a target that depends only on the home: base, housing quality and needs met. */
function homePart(quality: number, m: NeedsMet): number {
  return (
    MORALE.base +
    quality +
    MORALE.air * m.air +
    MORALE.water * m.water +
    MORALE.food * m.food +
    MORALE.power * m.power
  );
}

const longCommute = (minutes: number) => (minutes > MORALE.longCommuteMin ? MORALE.longCommute : 0);

export function targetMorale(input: {
  housingQuality: number;
  met: NeedsMet;
  wage: WageLevel;
  unpaid: boolean;
  commuteMin: number;
}): number {
  const t =
    homePart(input.housingQuality, input.met) +
    WAGE_LEVEL[input.wage].morale +
    (input.unpaid ? MORALE.unpaid : 0) +
    longCommute(input.commuteMin);
  return Math.min(100, Math.max(0, t));
}

export const moraleSystem: System = {
  id: 'morale',
  step(state, ctx) {
    // Each worker's target is their home's part plus their wage, unpaid and commute terms;
    // the sums keep targetMorale's order, so results match it to the bit.
    const homeless = homePart(0, ALL_MET);
    const atHome = new Float64Array(state.nextId).fill(homeless);
    for (const b of state.buildings) {
      const met = state.sections.find((s) => s.id === b.sectionId)?.needsMet ?? ALL_MET;
      atHome[b.id] = homePart(BUILDINGS[b.type].housing?.quality ?? 0, met);
    }
    const wage = SKILL_OF.map((s) => WAGE_LEVEL[state.wageLevel[s]].morale);
    const unpaid = state.payrollShortfall ? MORALE.unpaid : 0;
    const step = (MORALE.driftPerHour * ctx.dtMinutes) / 60;
    const p = state.people;
    // Morale of each workplace's crew, summed after this step's drift.
    const crewSum = new Float64Array(state.nextId);
    const crewN = new Uint32Array(state.nextId);
    for (let i = 0; i < p.count; i++) {
      const home = p.home[i]!;
      const t =
        (home >= 0 ? atHome[home]! : homeless) +
        wage[p.skill[i]!]! +
        unpaid +
        longCommute(p.commuteMin[i]!);
      const target = Math.min(100, Math.max(0, t));
      const m = p.morale[i]!;
      p.morale[i] = m + Math.max(-step, Math.min(step, target - m));
      const job = p.job[i]!;
      if (job < 0) continue;
      crewSum[job]! += p.morale[i]!;
      crewN[job]!++;
    }
    // Strikes: a workplace whose crew stays unhappy for 6 hours walks out.
    for (const b of state.buildings) {
      const n = crewN[b.id]!;
      if (n === 0) continue;
      const avg = crewSum[b.id]! / n;
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

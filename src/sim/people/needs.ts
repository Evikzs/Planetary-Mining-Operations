import { NEEDS_KG_PER_DAY } from '../../data/balance';
import type { GoodId } from '../../data/goods';
import type { System } from '../engine';
import { take } from '../inventory';
import { residentsBySection } from './housing';

export type Need = 'air' | 'water' | 'food';

export const NEEDS: { need: Need; good: GoodId; kgPerDay: number }[] = [
  { need: 'air', good: 'oxygen', kgPerDay: NEEDS_KG_PER_DAY.oxygen },
  { need: 'water', good: 'potableWater', kgPerDay: NEEDS_KG_PER_DAY.potableWater },
  { need: 'food', good: 'hydroponicProduce', kgPerDay: NEEDS_KG_PER_DAY.hydroponicProduce },
];

export interface NeedsMet {
  air: number;
  water: number;
  food: number;
  power: number;
}

export const ALL_MET: NeedsMet = { air: 1, water: 1, food: 1, power: 1 };

export const needsSystem: System = {
  id: 'needs',
  step(state, ctx) {
    const residents = residentsBySection(state);
    for (const section of state.sections) {
      const r = residents.get(section.id) ?? 0;
      const met: NeedsMet = { ...ALL_MET, power: section.power.factor };
      for (const { need, good, kgPerDay } of NEEDS) {
        if (r === 0) continue;
        const due = (r * kgPerDay * ctx.dtMinutes) / 1440 + (section.consumeRemainder[good] ?? 0);
        const stock = section.depot[good] ?? 0;
        met[need] = due > 0 ? Math.min(1, stock / due) : 1;
        if (stock >= due) {
          const whole = Math.floor(due);
          take(section.depot, good, whole);
          section.consumeRemainder[good] = due - whole;
        } else {
          take(section.depot, good, stock);
          section.consumeRemainder[good] = 0;
        }
        const daysLeft = (section.depot[good] ?? 0) / (r * kgPerDay);
        if (daysLeft < 3 && !section.shortageWarned[need]) {
          section.shortageWarned[need] = true;
          ctx.events.push({
            t: 'shortage',
            sectionId: section.id,
            need,
            daysLeft: Math.floor(daysLeft * 10) / 10,
          });
        } else if (daysLeft > 5) {
          section.shortageWarned[need] = false;
        }
      }
      section.needsMet = met;
    }
  },
};

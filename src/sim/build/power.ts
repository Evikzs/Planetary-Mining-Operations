import { BUILDINGS } from '../../data/buildings';
import { levelOutput, levelPower } from '../../data/balance';
import type { System } from '../engine';
import { staffing } from '../people/jobs';
import type { Building, GameState } from '../state';

export interface SectionPower {
  supplyKw: number;
  demandKw: number;
  /** Share of demand that is met, 0..1. */
  factor: number;
  /** True while a brownout is ongoing, so the event fires once per brownout. */
  brownout: boolean;
}

export const NO_POWER: SectionPower = { supplyKw: 0, demandKw: 0, factor: 1, brownout: false };

const working = (b: Building) => b.status !== 'constructing' && b.status !== 'upgrading';

export function sectionPower(state: GameState, sectionId: number): Omit<SectionPower, 'brownout'> {
  let supplyKw = 0;
  let demandKw = 0;
  for (const b of state.buildings) {
    if (b.sectionId !== sectionId || !working(b)) continue;
    const kw = BUILDINGS[b.type].powerKw;
    if (kw > 0) supplyKw += kw * levelOutput(b.level) * staffing(state, b);
    else demandKw += -kw * levelPower(b.level);
  }
  const factor = demandKw === 0 ? 1 : Math.min(1, supplyKw / demandKw);
  return { supplyKw, demandKw, factor };
}

export const powerSystem: System = {
  id: 'power',
  step(state, ctx) {
    for (const section of state.sections) {
      const p = sectionPower(state, section.id);
      const wasOut = section.power.brownout;
      section.power = { ...p, brownout: p.factor < 1 };
      if (p.factor < 1 && !wasOut) {
        ctx.events.push({ t: 'brownout', sectionId: section.id, factor: p.factor });
      }
      for (const b of state.buildings) {
        if (b.sectionId !== section.id || !working(b) || BUILDINGS[b.type].powerKw > 0) continue;
        if (p.factor < 1) b.status = 'unpowered';
        else if (b.status === 'unpowered') b.status = 'active';
      }
    }
  },
};

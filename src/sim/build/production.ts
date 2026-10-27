import { BUILDINGS, RECIPES } from '../../data/buildings';
import type { GoodId } from '../../data/goods';
import type { StepContext, System } from '../engine';
import { add, take } from '../inventory';
import { staffing, workforceProductivity } from '../people/jobs';
import type { Building, GameState } from '../state';
import { worldOf } from '../world/luna';
import { nominalOutputTph, outputCapsKg } from './buffers';
import { sectionState } from './sections';

const busy = (b: Building) => b.status === 'constructing' || b.status === 'upgrading';

/** Share of nominal speed before inputs and output space limit it. */
function speed(state: GameState, b: Building, ctx: StepContext): number {
  const deposit = worldOf(state).plots[b.plotId]?.deposit;
  const richness = BUILDINGS[b.type].extractTph > 0 ? (deposit?.richness ?? 0) : 1;
  const power = sectionState(state, b.sectionId)?.power.factor ?? 1;
  const strike = b.strike ? 0 : 1;
  return (
    richness *
    staffing(state, b) *
    power *
    workforceProductivity(state, b) *
    ctx.offlineEfficiency *
    strike
  );
}

/** Current output in tonnes per game hour. */
export function productionRateTph(state: GameState, b: Building): Partial<Record<GoodId, number>> {
  const ctx = { offlineEfficiency: 1 } as StepContext;
  const k = busy(b) ? 0 : speed(state, b, ctx);
  const out: Partial<Record<GoodId, number>> = {};
  for (const [g, t] of Object.entries(nominalOutputTph(state, b))) out[g as GoodId] = t * k;
  return out;
}

function emit(b: Building, g: GoodId, kgFloat: number): number {
  const acc = (b.remainders[g] ?? 0) + kgFloat;
  const whole = Math.floor(acc + 1e-9);
  b.remainders[g] = acc - whole;
  return Math.max(0, whole);
}

/** Runs one building's extraction or recipe. Returns true when full output buffers stopped it. */
function produce(state: GameState, b: Building, ctx: StepContext): boolean {
  const nominal = nominalOutputTph(state, b);
  const goods = Object.keys(nominal) as GoodId[];
  if (goods.length === 0) return false;
  const hours = ctx.dtMinutes / 60;
  let scale = speed(state, b, ctx);

  // Inputs limit the scale (recipes only).
  const recipe = b.recipeId && BUILDINGS[b.type].extractTph === 0 ? RECIPES[b.recipeId] : null;
  const inputs = recipe ? (Object.entries(recipe.inputs) as [GoodId, number][]) : [];
  const level = nominal[goods[0]!]! / (recipe ? recipe.outputs[goods[0]!]! : 1);
  for (const [g, t] of inputs) {
    const need = t * level * 1000 * hours;
    scale = Math.min(scale, (b.input[g] ?? 0) / need);
  }

  // Output space limits the scale.
  const caps = outputCapsKg(state, b);
  let blocked = false;
  for (const g of goods) {
    const perUnit = nominal[g]! * 1000 * hours;
    const space = Math.max(0, (caps[g] ?? 0) - (b.output[g] ?? 0));
    if (space < perUnit * scale) {
      scale = Math.min(scale, space / perUnit);
      blocked = space === 0;
    }
  }
  scale = Math.max(0, scale);

  for (const [g, t] of inputs)
    take(b.input, g, Math.min(b.input[g] ?? 0, emit(b, g, t * level * 1000 * hours * scale)));
  for (const g of goods) {
    const kg = emit(b, g, nominal[g]! * 1000 * hours * scale);
    add(b.output, g, kg);
    state.stats.producedKg[g] = (state.stats.producedKg[g] ?? 0) + kg;
  }
  return blocked;
}

function stepBuilding(state: GameState, b: Building, ctx: StepContext): void {
  const blocked = produce(state, b, ctx);
  if (b.strike) b.status = 'striking';
  else if (b.status !== 'unpowered')
    b.status = blocked ? 'blocked' : staffing(state, b) > 0 ? 'active' : 'unstaffed';
}

export const productionSystem: System = {
  id: 'production',
  step(state, ctx) {
    for (const b of state.buildings) if (!busy(b)) stepBuilding(state, b, ctx);
  },
};

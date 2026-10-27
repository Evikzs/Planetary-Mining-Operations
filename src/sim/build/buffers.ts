import { BUFFER_HOURS, levelOutput } from '../../data/balance';
import { BUILDINGS, RECIPES } from '../../data/buildings';
import type { GoodId } from '../../data/goods';
import type { Building } from '../state';
import { worldOf } from '../world/luna';
import type { GameState } from '../state';

/** kg of each recipe input a building keeps on hand (BUFFER_HOURS of use). */
export function inputTargetsKg(b: Building): Partial<Record<GoodId, number>> {
  const recipe = b.recipeId ? RECIPES[b.recipeId] : null;
  const out: Partial<Record<GoodId, number>> = {};
  if (!recipe) return out;
  for (const [g, t] of Object.entries(recipe.inputs)) {
    out[g as GoodId] = Math.round(BUFFER_HOURS * t * levelOutput(b.level) * 1000);
  }
  return out;
}

/** Hourly output in tonnes at full speed (before richness, staffing and power). */
export function nominalOutputTph(state: GameState, b: Building): Partial<Record<GoodId, number>> {
  const def = BUILDINGS[b.type];
  if (def.extractTph > 0) {
    const deposit = worldOf(state).plots[b.plotId]?.deposit;
    if (!deposit) return {};
    const factor = def.yieldFactor[deposit.goodId] ?? 1;
    return { [deposit.goodId]: def.extractTph * factor * levelOutput(b.level) };
  }
  const recipe = b.recipeId ? RECIPES[b.recipeId] : null;
  if (!recipe) return {};
  const out: Partial<Record<GoodId, number>> = {};
  for (const [g, t] of Object.entries(recipe.outputs)) out[g as GoodId] = t * levelOutput(b.level);
  return out;
}

/** Output buffer capacity in kg per good (BUFFER_HOURS of full-speed output). */
export function outputCapsKg(state: GameState, b: Building): Partial<Record<GoodId, number>> {
  const caps: Partial<Record<GoodId, number>> = {};
  for (const [g, t] of Object.entries(nominalOutputTph(state, b))) {
    caps[g as GoodId] = Math.round(BUFFER_HOURS * t * 1000);
  }
  return caps;
}

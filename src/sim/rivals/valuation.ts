import { WAGE_CENTS_PER_DAY } from '../../data/balance';
import {
  BUILDINGS,
  RECIPES,
  type BuildingTypeId,
  type RecipeId,
  type Skill,
} from '../../data/buildings';
import type { GoodId } from '../../data/goods';
import type { GameState } from '../state';
import { worldOf } from '../world/luna';

/** Goods at the last clearing price. */
export const goodValueCents = (state: GameState, goodId: GoodId, kg: number): number =>
  Math.round((kg * state.market[goodId].lastCents) / 1000);

/** Wages one game hour of a building's full level-1 crew costs, on all three shifts. */
export function crewWagesPerHourCents(type: BuildingTypeId): number {
  let cents = 0;
  for (const [skill, n] of Object.entries(BUILDINGS[type].jobs) as [Skill, number][]) {
    cents += (n * 3 * WAGE_CENTS_PER_DAY[skill]) / 24;
  }
  return cents;
}

/**
 * What one game hour of a level-1 building earns over its inputs and its crew's wages, at the
 * last clearing prices. A deposit building on the wrong deposit earns nothing.
 */
export function hourlyMarginCents(
  state: GameState,
  plotId: number,
  type: BuildingTypeId,
  recipeId: RecipeId | null,
): number {
  const def = BUILDINGS[type];
  const price = (g: GoodId) => state.market[g].lastCents;
  let value = 0;
  if (def.extractTph > 0) {
    const deposit = worldOf(state).plots[plotId]?.deposit;
    if (!deposit || !def.depositGoods.includes(deposit.goodId)) return 0;
    const kreep = type === 'mine' && deposit.goodId === 'kreep' ? 0.5 : 1;
    value = def.extractTph * deposit.richness * kreep * price(deposit.goodId);
  } else if (recipeId) {
    const r = RECIPES[recipeId];
    for (const [g, t] of Object.entries(r.outputs)) value += t * price(g as GoodId);
    for (const [g, t] of Object.entries(r.inputs)) value -= t * price(g as GoodId);
  } else {
    return 0;
  }
  return Math.round(value - crewWagesPerHourCents(type));
}

/** Extractors that can work a deposit of each raw good. */
export const EXTRACTORS: BuildingTypeId[] = ['mine', 'regolithScoop', 'iceDrill', 'he3Harvester'];

/** What a section's deposits could earn over a horizon, each with its best extractor. */
export function sectionValueCents(
  state: GameState,
  sectionId: number,
  horizonDays: number,
): number {
  let perHour = 0;
  for (const p of worldOf(state).plots) {
    if (p.sectionId !== sectionId || !p.deposit) continue;
    let best = 0;
    for (const type of EXTRACTORS)
      best = Math.max(best, hourlyMarginCents(state, p.id, type, null));
    perHour += best;
  }
  return Math.round(perHour * 24 * horizonDays);
}

import { BUILDINGS, type BuildingTypeId, type RecipeId } from '../../data/buildings';
import { MAX_LEVEL, upgradeCost, upgradeHours } from '../../data/balance';
import type { GoodId } from '../../data/goods';
import { fail, OK, type CommandResult } from '../commands';
import type { System } from '../engine';
import { add, take, totalKg, type Inventory } from '../inventory';
import { balance, transfer } from '../ledger';
import { newId, type Building, type GameState, type Priority } from '../state';
import { evictResidents } from '../people/housing';
import { worldOf } from '../world/luna';
import { connectToNetwork } from '../world/roads';
import { createBelt, removeBelt } from './belts';
import { addBuilding, gridFor, sectionState, storageCapKg } from './sections';

const kg = (t: number) => Math.round(t * 1000);

function hasMaterials(depot: Inventory, materials: Partial<Record<GoodId, number>>): boolean {
  return Object.entries(materials).every(([g, t]) => (depot[g as GoodId] ?? 0) >= kg(t));
}

function consume(depot: Inventory, materials: Partial<Record<GoodId, number>>): void {
  for (const [g, t] of Object.entries(materials)) take(depot, g as GoodId, kg(t));
}

const busy = (b: Building) => b.status === 'constructing' || b.status === 'upgrading';

export function findBuilding(state: GameState, id: number): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

export function plotOccupied(state: GameState, plotId: number): boolean {
  return state.buildings.some((b) => b.plotId === plotId);
}

export function build(
  state: GameState,
  cmd: { plotId: number; type: BuildingTypeId; recipeId?: RecipeId },
): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const plot = worldOf(state).plots[cmd.plotId];
  const def = BUILDINGS[cmd.type];
  if (!plot || !def) return fail('UNKNOWN_ID');
  const section = sectionState(state, plot.sectionId);
  if (!section) return fail('NOT_OWNED');
  if (plotOccupied(state, plot.id)) return fail('PLOT_OCCUPIED');
  if (def.plot === 'hub' || def.plot !== plot.kind) return fail('WRONG_PLOT_KIND');
  if (def.plot === 'deposit' && !def.depositGoods.includes(plot.deposit!.goodId)) {
    return fail('NO_DEPOSIT_MATCH');
  }
  const recipeId = cmd.recipeId ?? def.recipes[0] ?? null;
  if (recipeId !== null && !def.recipes.includes(recipeId)) return fail('INVALID_RECIPE');
  if (balance(state.ledger, 'player') < def.cost.cents) return fail('INSUFFICIENT_CASH');
  if (!hasMaterials(section.depot, def.cost.materials)) return fail('INSUFFICIENT_MATERIALS');
  const road = connectToNetwork(gridFor(state, plot.sectionId), section.roadNet!, plot.dir, () =>
    newId(state),
  );
  if (!road) return fail('NO_ROAD_ACCESS');
  transfer(state.ledger, 'player', 'world', def.cost.cents);
  consume(section.depot, def.cost.materials);
  const building = addBuilding(state, plot, cmd.type, 'constructing', recipeId);
  if (def.belt) createBelt(state, building);
  state.pendingEvents.push({ t: 'constructionStarted', buildingId: building.id });
  return OK;
}

export function upgrade(state: GameState, buildingId: number): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const b = findBuilding(state, buildingId);
  if (!b) return fail('UNKNOWN_ID');
  const def = BUILDINGS[b.type];
  if (busy(b)) return fail('BUSY');
  if (b.level >= MAX_LEVEL || def.buildHours === 0) return fail('MAX_LEVEL');
  const cost = upgradeCost(def, b.level);
  const section = sectionState(state, b.sectionId)!;
  if (balance(state.ledger, 'player') < cost.cents) return fail('INSUFFICIENT_CASH');
  if (!hasMaterials(section.depot, cost.materials)) return fail('INSUFFICIENT_MATERIALS');
  transfer(state.ledger, 'player', 'world', cost.cents);
  consume(section.depot, cost.materials);
  b.status = 'upgrading';
  b.progress = 0;
  b.workHours = upgradeHours(def, b.level);
  state.pendingEvents.push({ t: 'constructionStarted', buildingId: b.id });
  return OK;
}

/** Moves buffers back to the depot while there is space; the rest is lost. */
function flushBuffers(state: GameState, b: Building): void {
  const section = sectionState(state, b.sectionId)!;
  for (const buffer of [b.input, b.output]) {
    for (const [g, amount] of Object.entries(buffer)) {
      const free = Math.max(0, storageCapKg(state, b.sectionId) - totalKg(section.depot));
      add(section.depot, g as GoodId, Math.min(amount, free));
      delete buffer[g as GoodId];
    }
  }
}

export function demolish(state: GameState, buildingId: number): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const b = findBuilding(state, buildingId);
  if (!b) return fail('UNKNOWN_ID');
  if (b.type === 'depot') return fail('CANNOT_DEMOLISH');
  flushBuffers(state, b);
  removeBelt(state, b);
  const left = evictResidents(state, b);
  if (left > 0) state.pendingEvents.push({ t: 'emigration', count: left });
  transfer(state.ledger, 'world', 'player', Math.round(BUILDINGS[b.type].cost.cents * 0.25));
  state.buildings = state.buildings.filter((x) => x.id !== b.id);
  return OK;
}

export function setRecipe(state: GameState, buildingId: number, recipeId: RecipeId): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const b = findBuilding(state, buildingId);
  if (!b) return fail('UNKNOWN_ID');
  if (!BUILDINGS[b.type].recipes.includes(recipeId)) return fail('INVALID_RECIPE');
  if (b.recipeId !== recipeId) {
    flushBuffers(state, b);
    b.recipeId = recipeId;
  }
  return OK;
}

export function setPriority(
  state: GameState,
  buildingId: number,
  priority: Priority,
): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const b = findBuilding(state, buildingId);
  if (!b) return fail('UNKNOWN_ID');
  b.priority = priority;
  return OK;
}

export const constructionSystem: System = {
  id: 'construction',
  step(state, ctx) {
    for (const b of state.buildings) {
      if (!busy(b)) continue;
      b.progress = Math.min(1, b.progress + ctx.dtMinutes / (b.workHours * 60));
      if (b.progress >= 1 - 1e-9) {
        if (b.status === 'upgrading') b.level++;
        b.status = 'active';
        b.progress = 1;
        b.workHours = 0;
        ctx.events.push({ t: 'buildingCompleted', buildingId: b.id });
      }
    }
  },
};

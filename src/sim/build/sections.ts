import { BUILDINGS, type BuildingTypeId, type RecipeId } from '../../data/buildings';
import { levelOutput } from '../../data/balance';
import type { Vec3 } from '../../shared/vec3';
import {
  newId,
  type Building,
  type BuildingStatus,
  type GameState,
  type SectionState,
} from '../state';
import { worldOf } from '../world/luna';
import { buildSectionGrid, createRoadNet, type SectionGrid } from '../world/roads';
import { NO_POWER } from './power';
import { ALL_MET } from '../people/needs';
import type { Plot } from '../world/types';

export function sectionState(state: GameState, sectionId: number): SectionState | undefined {
  return state.sections.find((s) => s.id === sectionId);
}

export function hubDir(state: GameState, sectionId: number): Vec3 {
  const world = worldOf(state);
  return world.plots[world.sections[sectionId]!.hubPlotId]!.dir;
}

export function gridFor(state: GameState, sectionId: number): SectionGrid {
  return buildSectionGrid(worldOf(state), sectionId, hubDir(state, sectionId));
}

/** Depot plus warehouses, in kg. */
export function storageCapKg(state: GameState, sectionId: number): number {
  let cap = 0;
  for (const b of state.buildings) {
    if (b.sectionId !== sectionId || b.status === 'constructing') continue;
    const t = BUILDINGS[b.type].storageT;
    if (t > 0) cap += Math.round(t * levelOutput(b.level) * 1000);
  }
  return cap;
}

export function addBuilding(
  state: GameState,
  plot: Plot,
  type: BuildingTypeId,
  status: BuildingStatus,
  recipeId: RecipeId | null = BUILDINGS[type].recipes[0] ?? null,
): Building {
  const building: Building = {
    id: newId(state),
    plotId: plot.id,
    sectionId: plot.sectionId,
    type,
    level: 1,
    status,
    progress: status === 'constructing' ? 0 : 1,
    workHours: status === 'constructing' ? BUILDINGS[type].buildHours : 0,
    recipeId,
    priority: 'normal',
    input: {},
    output: {},
    remainders: {},
    beltId: null,
    lowMoraleMinutes: 0,
    strike: false,
  };
  state.buildings.push(building);
  return building;
}

/** Takes a section for the player: state, depot on the hub, and a road net seeded there. */
export function ownSection(state: GameState, sectionId: number): SectionState {
  const world = worldOf(state);
  const section: SectionState = {
    id: sectionId,
    depot: {},
    roadNet: createRoadNet(gridFor(state, sectionId)),
    power: { ...NO_POWER },
    needsMet: { ...ALL_MET },
    consumeRemainder: {},
    shortageWarned: {},
  };
  state.sections.push(section);
  addBuilding(state, world.plots[world.sections[sectionId]!.hubPlotId]!, 'depot', 'active');
  return section;
}

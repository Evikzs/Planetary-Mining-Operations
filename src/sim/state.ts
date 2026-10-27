import type { BuildingTypeId, RecipeId } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { SectionPower } from './build/power';
import type { SimEvent } from './events';
import type { Inventory } from './inventory';
import { createLedger, type Ledger } from './ledger';
import { createRng, deriveSeed, type RngState } from './rng';
import type { RoadNet } from './world/roads';

export type CompanionId = 'veteran' | 'shipAi' | 'coFounder' | 'pirate';

export interface Company {
  name: string;
  companionId: CompanionId;
}

export type BuildingStatus =
  'constructing' | 'upgrading' | 'active' | 'blocked' | 'unpowered' | 'unstaffed' | 'striking';

export type Priority = 'high' | 'normal' | 'low';

export interface Building {
  id: number;
  plotId: number;
  sectionId: number;
  type: BuildingTypeId;
  level: number;
  status: BuildingStatus;
  /** Construction or upgrade progress, 0..1. */
  progress: number;
  /** Game hours the current construction or upgrade takes. */
  workHours: number;
  recipeId: RecipeId | null;
  priority: Priority;
  input: Inventory;
  output: Inventory;
  /** Fractional kg carried between ticks, never part of conservation. */
  remainders: Partial<Record<GoodId, number>>;
  beltId: number | null;
}

/** A player-owned section. Sections without state belong to the Lunar Authority. */
export interface SectionState {
  id: number;
  depot: Inventory;
  roadNet: RoadNet | null;
  power: SectionPower;
}

export interface GameState {
  version: 1;
  seed: number;
  tick: number;
  rng: RngState;
  company: Company | null;
  nextId: number;
  ledger: Ledger;
  sections: SectionState[];
  buildings: Building[];
  landPurchases: number;
  /** Events raised by commands, delivered with the next step. */
  pendingEvents: SimEvent[];
}

export function createInitialState(seed: number): GameState {
  return {
    version: 1,
    seed,
    tick: 0,
    rng: createRng(deriveSeed(seed, 'main')).getState(),
    company: null,
    nextId: 1,
    ledger: createLedger(),
    sections: [],
    buildings: [],
    landPurchases: 0,
    pendingEvents: [],
  };
}

export const newId = (state: GameState): number => state.nextId++;

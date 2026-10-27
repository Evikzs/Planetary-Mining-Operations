import type { BuildingTypeId, RecipeId, Skill } from '../data/buildings';
import type { WageLevel } from '../data/balance';
import type { GoodId } from '../data/goods';
import type { Belt } from './build/belts';
import type { SectionPower } from './build/power';
import type { SimEvent } from './events';
import type { Inventory } from './inventory';
import { createLedger, type Ledger } from './ledger';
import { createRng, deriveSeed, type RngState } from './rng';
import type { RoadNet } from './world/roads';
import type { Trip } from '../shared/trips';
import type { Need, NeedsMet } from './people/needs';
import { createPeople, type People } from './people/store';

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
  /** Minutes the crew's average morale has stayed below the strike line. */
  lowMoraleMinutes: number;
  strike: boolean;
}

/** A player-owned section. Sections without state belong to the Lunar Authority. */
export interface SectionState {
  id: number;
  depot: Inventory;
  roadNet: RoadNet | null;
  power: SectionPower;
  needsMet: NeedsMet;
  consumeRemainder: Partial<Record<GoodId, number>>;
  shortageWarned: Partial<Record<Need, boolean>>;
}

export interface Stats {
  producedKg: Partial<Record<GoodId, number>>;
  soldKg: Partial<Record<GoodId, number>>;
  boughtKg: Partial<Record<GoodId, number>>;
  incomeCents: number;
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
  belts: Belt[];
  landPurchases: number;
  stats: Stats;
  people: People;
  wageLevel: Record<Skill, WageLevel>;
  payrollShortfall: boolean;
  /** Bus runs on the road or waiting for a bus. */
  trips: Trip[];
  /** Per section: buses from its rover garages and when each is free again. */
  buses: Record<number, { total: number; busyUntil: number[] }>;
  /** Set when buildings or workers change, so jobs are filled before the next hourly pass. */
  jobsDirty: boolean;
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
    belts: [],
    landPurchases: 0,
    stats: { producedKg: {}, soldKg: {}, boughtKg: {}, incomeCents: 0 },
    people: createPeople(),
    wageLevel: { miner: 'standard', technician: 'standard', engineer: 'standard' },
    payrollShortfall: false,
    trips: [],
    buses: {},
    jobsDirty: false,
    pendingEvents: [],
  };
}

export const newId = (state: GameState): number => state.nextId++;

import type { BuildingTypeId, RecipeId, Skill } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { Belt } from './build/belts';
import type { SectionPower } from './build/power';
import type { SimEvent } from './events';
import type { Inventory } from './inventory';
import { createLedger, type Ledger } from './ledger';
import { createRng, deriveSeed, type RngState } from './rng';
import type { RoadNet } from './world/roads';
import type { Trip } from '../shared/trips';
import { COLONY } from '../data/balance';
import { GOOD_IDS, GOODS } from '../data/goods';
import type { Alert } from './alerts';
import type { Contract } from './contracts/contracts';
import { createStory, type StoryState } from './story/story';
import type { GoodMarket, Order } from './market/orders';
import type { Need, NeedsMet } from './people/needs';
import { createPeople, type People } from './people/store';
import type { CompanyId, CompanyState } from './companies';
import type { Loan } from './finance/credit';
import type { Holding, Listing, ShareOrder } from './finance/shares';
import type { Auction } from './auctions';
import type { NewsItem } from './news';

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
  /** What putting it up and raising it cost, cash and materials; and that less depreciation. */
  costCents: number;
  bookCents: number;
  /** Job slots that replace the type's own, as on a contract site. */
  jobs?: Partial<Record<Skill, number>>;
}

/** An owned section. Sections without state belong to the Lunar Authority. */
export interface SectionState {
  id: number;
  owner: CompanyId;
  depot: Inventory;
  roadNet: RoadNet | null;
  power: SectionPower;
  needsMet: NeedsMet;
  consumeRemainder: Partial<Record<GoodId, number>>;
  shortageWarned: Partial<Record<Need, boolean>>;
  /** What its owner paid for it, on its books as land; 0 for a charter. */
  landCents: number;
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
  companies: CompanyState[];
  /** Whether founding brings the five rivals: off only for single-company tests. */
  withRivals: boolean;
  nextId: number;
  /** Bus trips count apart: they come and go by the thousand, and arrays are sized by nextId. */
  nextTripId: number;
  ledger: Ledger;
  sections: SectionState[];
  buildings: Building[];
  belts: Belt[];
  landPurchases: number;
  stats: Stats;
  people: People;
  /** Bus runs on the road or waiting for a bus. */
  trips: Trip[];
  /** Per section: buses from its rover garages and when each is free again. */
  buses: Record<number, { total: number; busyUntil: number[] }>;
  /** Set when buildings or workers change, so jobs are filled before the next hourly pass. */
  jobsDirty: boolean;
  market: Record<GoodId, GoodMarket>;
  orders: Order[];
  loans: Loan[];
  listings: Listing[];
  holdings: Holding[];
  shareOrders: ShareOrder[];
  /** Open lots and the latest closed ones. */
  auctions: Auction[];
  /** The latest 30 public events, newest first. */
  news: NewsItem[];
  /** People in the Lunar colony who buy what the market sells. */
  colonyPop: number;
  contracts: Contract[];
  /** Finished infrastructure the colony now owns. */
  clientAssets: { plotId: number; asset: string }[];
  story: StoryState;
  /** Latest alerts, newest first. */
  alerts: Alert[];
  /** Events raised by commands, delivered with the next step. */
  pendingEvents: SimEvent[];
}

/** Every good starts at its base price with a day of NPC volume. */
function freshMarkets(): Record<GoodId, GoodMarket> {
  const market = {} as Record<GoodId, GoodMarket>;
  for (const g of GOOD_IDS) {
    const p = GOODS[g].basePriceCents;
    const day = GOODS[g].npc.volumeTph * 24_000;
    market[g] = { goodId: g, pRefCents: p, lastCents: p, history: [], volume24hKg: day };
  }
  return market;
}

export function createInitialState(seed: number): GameState {
  return {
    version: 1,
    seed,
    tick: 0,
    rng: createRng(deriveSeed(seed, 'main')).getState(),
    companies: [],
    withRivals: true,
    nextId: 1,
    nextTripId: 1,
    ledger: createLedger(),
    sections: [],
    buildings: [],
    belts: [],
    landPurchases: 0,
    stats: { producedKg: {}, soldKg: {}, boughtKg: {}, incomeCents: 0 },
    people: createPeople(),
    trips: [],
    buses: {},
    jobsDirty: false,
    market: freshMarkets(),
    orders: [],
    loans: [],
    listings: [],
    holdings: [],
    shareOrders: [],
    auctions: [],
    news: [],
    colonyPop: COLONY.startPop,
    contracts: [],
    clientAssets: [],
    story: createStory(),
    alerts: [],
    pendingEvents: [],
  };
}

export const newId = (state: GameState): number => state.nextId++;

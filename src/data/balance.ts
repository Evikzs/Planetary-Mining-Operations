import type { BuildingDef, BuildingTypeId, Skill } from './buildings';
import type { GoodId } from './goods';

export const MAX_LEVEL = 10;
export const levelOutput = (level: number) => 1 + 0.35 * (level - 1);
export const levelJobs = (level: number, n: number) => Math.ceil(n * (1 + 0.25 * (level - 1)));
export const levelPower = (level: number) => 1 + 0.3 * (level - 1);
export const levelBuses = (level: number) => 4 + (level - 1);

/** Cost to go from `level` to `level + 1`. */
export function upgradeCost(def: BuildingDef, level: number): BuildingDef['cost'] {
  const k = 0.6 * level;
  const materials: Partial<Record<GoodId, number>> = {};
  for (const [g, t] of Object.entries(def.cost.materials)) {
    materials[g as GoodId] = Math.round(t * k * 1000) / 1000;
  }
  return { cents: Math.round(def.cost.cents * k), materials };
}

export const upgradeHours = (def: BuildingDef, level: number) => def.buildHours * 0.5 * level;

export const START_CASH_CENTS = 25_000_000;
export const START_WORKERS: Record<Skill, number> = { miner: 18, technician: 12, engineer: 3 };
export const START_STOCK_T: Partial<Record<GoodId, number>> = {
  prefabStructures: 150,
  machinery: 12,
  solarPanels: 10,
  electronics: 2,
  oxygen: 6,
  potableWater: 10,
  hydroponicProduce: 1.5,
  glass: 20,
};
export const START_BUILDINGS: BuildingTypeId[] = [
  'crewQuarters',
  'roverGarage',
  'solarArray',
  'solarArray',
];

export const NEEDS_KG_PER_DAY = { oxygen: 0.84, potableWater: 3.0, hydroponicProduce: 1.8 };
export const WAGE_CENTS_PER_DAY: Record<Skill, number> = {
  miner: 9000,
  technician: 13000,
  engineer: 20000,
};
export type WageLevel = 'low' | 'standard' | 'high';
export const WAGE_LEVEL: Record<WageLevel, { factor: number; morale: number }> = {
  low: { factor: 0.8, morale: -10 },
  standard: { factor: 1, morale: 0 },
  high: { factor: 1.25, morale: 10 },
};
export const MORALE = {
  base: 30,
  air: 15,
  water: 15,
  food: 15,
  power: 10,
  unpaid: -20,
  longCommuteMin: 45,
  longCommute: -5,
  driftPerHour: 2,
  strikeBelow: 25,
  strikeHours: 6,
  strikeResume: 35,
  emigrateBelow: 15,
  emigrateChancePerHour: 0.02,
  migrateMinMorale: 50,
} as const;
export const migrationPerDay = (population: number) => 2 + 0.05 * population;
export const moraleProductivity = (morale: number) => 0.85 + 0.003 * morale;
export const commuteProductivity = (minutes: number) =>
  1 - Math.min(0.3, Math.max(0, (minutes - 20) / 200));

export const BUS_CAPACITY = 24;
export const BUS_LEAD_MINUTES = 40;
export const STOP_DWELL_MINUTES = 1;
export const MAX_STOPS = 4;
export const BELT_CAPACITY_TPH = 30;
export const BUFFER_HOURS = 2;

export const LAND_PRICE = { baseCents: 6_000_000, growth: 1.6 } as const;
export const MARKET = {
  meanReversion: 0.03,
  momentum: 0.6,
  noiseSigma: 0.01,
  boundsFactor: 20,
  historyHours: 168,
} as const;
export const COLONY = { startPop: 1200, demandExponent: 0.8 } as const;
export const OFFLINE = {
  capMs: 28_800_000,
  efficiency: 0.5,
  fineThresholdTicks: 300,
  awayScreenMinHours: 10,
} as const;

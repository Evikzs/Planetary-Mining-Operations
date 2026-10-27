import type { RawGoodId } from '../sim/world/types';
import type { GoodId } from './goods';

export type Skill = 'miner' | 'technician' | 'engineer';
export const SKILLS: Skill[] = ['miner', 'technician', 'engineer'];

export type RecipeId =
  | 'steel'
  | 'titaniumAlloy'
  | 'aluminium'
  | 'glass'
  | 'sinteredConcrete'
  | 'siliconWafers'
  | 'rareEarthOxides'
  | 'fertiliser'
  | 'electrolysis'
  | 'airFromIlmenite'
  | 'water'
  | 'produce'
  | 'solarPanels'
  | 'prefab'
  | 'machinery';

/** Tonnes per game hour at level 1. */
export interface RecipeDef {
  id: RecipeId;
  name: string;
  inputs: Partial<Record<GoodId, number>>;
  outputs: Partial<Record<GoodId, number>>;
}

export type BuildingTypeId =
  | 'depot'
  | 'regolithScoop'
  | 'mine'
  | 'iceDrill'
  | 'he3Harvester'
  | 'smelter'
  | 'waferFab'
  | 'chemicalRefinery'
  | 'electrolysisPlant'
  | 'airPlant'
  | 'waterPlant'
  | 'hydroponicsFarm'
  | 'assemblyWorks'
  | 'solarArray'
  | 'crewQuarters'
  | 'habitatDome'
  | 'warehouse'
  | 'roverGarage'
  | 'contractSite';

export interface BuildingDef {
  id: BuildingTypeId;
  name: string;
  /** Hub and public-plot buildings are placed by the game, not built by the player. */
  plot: 'hub' | 'deposit' | 'build' | 'public';
  depositGoods: RawGoodId[];
  extractTph: number;
  /** Extraction multiplier per deposit good (default 1). */
  yieldFactor: Partial<Record<RawGoodId, number>>;
  recipes: RecipeId[];
  /** Workers per shift at level 1. */
  jobs: Partial<Record<Skill, number>>;
  /** Positive produces, negative consumes. */
  powerKw: number;
  housing: { capacity: number; quality: number } | null;
  storageT: number;
  buses: number;
  cost: { cents: number; materials: Partial<Record<GoodId, number>> };
  buildHours: number;
  belt: boolean;
}

const recipe = (
  id: RecipeId,
  name: string,
  inputs: RecipeDef['inputs'],
  outputs: RecipeDef['outputs'],
): RecipeDef => ({ id, name, inputs, outputs });

export const RECIPES: Record<RecipeId, RecipeDef> = {
  steel: recipe('steel', 'Steel', { ilmenite: 4 }, { steel: 1.5 }),
  titaniumAlloy: recipe('titaniumAlloy', 'Titanium alloy', { ilmenite: 4 }, { titaniumAlloy: 0.3 }),
  aluminium: recipe('aluminium', 'Aluminium', { anorthite: 4 }, { aluminium: 0.8 }),
  glass: recipe('glass', 'Glass', { anorthite: 3 }, { glass: 1.5 }),
  sinteredConcrete: recipe(
    'sinteredConcrete',
    'Sintered concrete',
    { regolith: 8 },
    { sinteredConcrete: 6 },
  ),
  siliconWafers: recipe('siliconWafers', 'Silicon wafers', { glass: 0.5 }, { siliconWafers: 0.08 }),
  rareEarthOxides: recipe(
    'rareEarthOxides',
    'Rare-earth oxides',
    { kreep: 2 },
    { rareEarthOxides: 0.25 },
  ),
  fertiliser: recipe(
    'fertiliser',
    'Fertiliser',
    { kreep: 1, polarVolatiles: 0.5 },
    { fertiliser: 0.3 },
  ),
  electrolysis: recipe(
    'electrolysis',
    'Oxygen and hydrogen',
    { polarVolatiles: 3 },
    { oxygen: 1.2, hydrogen: 0.15 },
  ),
  airFromIlmenite: recipe(
    'airFromIlmenite',
    'Oxygen from ilmenite',
    { ilmenite: 4 },
    { oxygen: 0.9 },
  ),
  water: recipe('water', 'Potable water', { polarVolatiles: 2 }, { potableWater: 1.6 }),
  produce: recipe(
    'produce',
    'Hydroponic produce',
    { potableWater: 0.2, fertiliser: 0.02 },
    { hydroponicProduce: 0.06 },
  ),
  solarPanels: recipe(
    'solarPanels',
    'Solar panels',
    { siliconWafers: 0.05, aluminium: 0.2, glass: 0.2 },
    { solarPanels: 0.08 },
  ),
  prefab: recipe(
    'prefab',
    'Prefab structures',
    { sinteredConcrete: 1.5, steel: 0.5 },
    { prefabStructures: 1.2 },
  ),
  machinery: recipe(
    'machinery',
    'Machinery',
    { steel: 0.4, electronics: 0.01 },
    { machinery: 0.08 },
  ),
};

const def = (
  d: Partial<BuildingDef> & Pick<BuildingDef, 'id' | 'name' | 'plot' | 'powerKw' | 'cost'>,
): BuildingDef => ({
  depositGoods: [],
  extractTph: 0,
  yieldFactor: {},
  recipes: [],
  jobs: {},
  housing: null,
  storageT: 0,
  buses: 0,
  buildHours: 0,
  belt: false,
  ...d,
});

const cost = (lm: number, materials: BuildingDef['cost']['materials']) => ({
  cents: lm * 100,
  materials,
});

export const BUILDINGS: Record<BuildingTypeId, BuildingDef> = {
  depot: def({
    id: 'depot',
    name: 'Depot',
    plot: 'hub',
    powerKw: -50,
    storageT: 3000,
    cost: cost(0, {}),
  }),
  regolithScoop: def({
    id: 'regolithScoop',
    name: 'Regolith scoop',
    plot: 'deposit',
    depositGoods: ['regolith'],
    extractTph: 12,
    jobs: { miner: 3 },
    powerKw: -120,
    cost: cost(2500, { prefabStructures: 10, machinery: 1 }),
    buildHours: 2,
    belt: true,
  }),
  mine: def({
    id: 'mine',
    name: 'Mine',
    plot: 'deposit',
    depositGoods: ['ilmenite', 'anorthite', 'kreep'],
    extractTph: 6,
    yieldFactor: { kreep: 0.5 },
    jobs: { miner: 6, technician: 1 },
    powerKw: -250,
    cost: cost(6000, { prefabStructures: 20, machinery: 2 }),
    buildHours: 4,
    belt: true,
  }),
  iceDrill: def({
    id: 'iceDrill',
    name: 'Ice drill',
    plot: 'deposit',
    depositGoods: ['polarVolatiles'],
    extractTph: 5,
    jobs: { miner: 4, technician: 1 },
    powerKw: -300,
    cost: cost(5000, { prefabStructures: 15, machinery: 2 }),
    buildHours: 4,
    belt: true,
  }),
  he3Harvester: def({
    id: 'he3Harvester',
    name: 'He-3 harvester',
    plot: 'deposit',
    depositGoods: ['helium3'],
    extractTph: 0.01,
    jobs: { miner: 8, technician: 2, engineer: 1 },
    powerKw: -900,
    cost: cost(40000, { prefabStructures: 40, machinery: 6, electronics: 2 }),
    buildHours: 10,
    belt: true,
  }),
  smelter: def({
    id: 'smelter',
    name: 'Smelter',
    plot: 'build',
    recipes: ['steel', 'titaniumAlloy', 'aluminium', 'glass', 'sinteredConcrete'],
    jobs: { technician: 4, engineer: 1 },
    powerKw: -600,
    cost: cost(12000, { prefabStructures: 40, machinery: 4 }),
    buildHours: 6,
    belt: true,
  }),
  waferFab: def({
    id: 'waferFab',
    name: 'Wafer fab',
    plot: 'build',
    recipes: ['siliconWafers'],
    jobs: { technician: 3, engineer: 2 },
    powerKw: -500,
    cost: cost(30000, { prefabStructures: 30, machinery: 4, electronics: 2 }),
    buildHours: 8,
    belt: true,
  }),
  chemicalRefinery: def({
    id: 'chemicalRefinery',
    name: 'Chemical refinery',
    plot: 'build',
    recipes: ['rareEarthOxides', 'fertiliser'],
    jobs: { technician: 3, engineer: 1 },
    powerKw: -400,
    cost: cost(18000, { prefabStructures: 35, machinery: 4 }),
    buildHours: 6,
    belt: true,
  }),
  electrolysisPlant: def({
    id: 'electrolysisPlant',
    name: 'Electrolysis plant',
    plot: 'build',
    recipes: ['electrolysis'],
    jobs: { technician: 2, engineer: 1 },
    powerKw: -700,
    cost: cost(10000, { prefabStructures: 25, machinery: 3 }),
    buildHours: 5,
    belt: true,
  }),
  airPlant: def({
    id: 'airPlant',
    name: 'Air plant',
    plot: 'build',
    recipes: ['airFromIlmenite'],
    jobs: { technician: 2 },
    powerKw: -300,
    cost: cost(7000, { prefabStructures: 20, machinery: 2 }),
    buildHours: 4,
    belt: true,
  }),
  waterPlant: def({
    id: 'waterPlant',
    name: 'Water plant',
    plot: 'build',
    recipes: ['water'],
    jobs: { technician: 2 },
    powerKw: -200,
    cost: cost(6000, { prefabStructures: 20, machinery: 2 }),
    buildHours: 3,
    belt: true,
  }),
  hydroponicsFarm: def({
    id: 'hydroponicsFarm',
    name: 'Hydroponics farm',
    plot: 'build',
    recipes: ['produce'],
    jobs: { technician: 3 },
    powerKw: -250,
    cost: cost(8000, { prefabStructures: 25, glass: 10 }),
    buildHours: 5,
    belt: true,
  }),
  assemblyWorks: def({
    id: 'assemblyWorks',
    name: 'Assembly works',
    plot: 'build',
    recipes: ['solarPanels', 'prefab', 'machinery'],
    jobs: { technician: 4, engineer: 2 },
    powerKw: -450,
    cost: cost(20000, { prefabStructures: 40, machinery: 6 }),
    buildHours: 8,
    belt: true,
  }),
  solarArray: def({
    id: 'solarArray',
    name: 'Solar array',
    plot: 'build',
    jobs: { technician: 1 },
    powerKw: 400,
    cost: cost(3000, { solarPanels: 2 }),
    buildHours: 2,
  }),
  crewQuarters: def({
    id: 'crewQuarters',
    name: 'Crew quarters',
    plot: 'build',
    powerKw: -60,
    housing: { capacity: 36, quality: 5 },
    cost: cost(4000, { prefabStructures: 30 }),
    buildHours: 3,
  }),
  habitatDome: def({
    id: 'habitatDome',
    name: 'Habitat dome',
    plot: 'build',
    powerKw: -150,
    housing: { capacity: 96, quality: 15 },
    cost: cost(15000, { prefabStructures: 80, glass: 20 }),
    buildHours: 8,
  }),
  warehouse: def({
    id: 'warehouse',
    name: 'Warehouse',
    plot: 'build',
    jobs: { technician: 1 },
    powerKw: -20,
    storageT: 8000,
    cost: cost(5000, { prefabStructures: 30 }),
    buildHours: 3,
  }),
  roverGarage: def({
    id: 'roverGarage',
    name: 'Rover garage',
    plot: 'build',
    jobs: { technician: 1 },
    powerKw: -80,
    buses: 4,
    cost: cost(6000, { prefabStructures: 20, machinery: 3 }),
    buildHours: 4,
  }),
  // Work site of an infrastructure contract: its job slots follow the contract's stage.
  contractSite: def({
    id: 'contractSite',
    name: 'Contract site',
    plot: 'public',
    powerKw: 0,
    cost: cost(0, {}),
  }),
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingTypeId[];

import type { RawGoodId } from '../sim/world/types';

export type GoodId =
  | RawGoodId
  | 'steel'
  | 'titaniumAlloy'
  | 'aluminium'
  | 'sinteredConcrete'
  | 'glass'
  | 'siliconWafers'
  | 'rareEarthOxides'
  | 'oxygen'
  | 'potableWater'
  | 'hydrogen'
  | 'fertiliser'
  | 'hydroponicProduce'
  | 'electronics'
  | 'machinery'
  | 'prefabStructures'
  | 'solarPanels';

export type GoodGroup = 'raw' | 'refined' | 'component';
export type CrateShape = 'ore' | 'ingot' | 'liquid' | 'crate' | 'panel';
export type Necessity = 'air' | 'water' | 'food';

export interface GoodDef {
  id: GoodId;
  name: string;
  group: GoodGroup;
  /** Lunar reference price in LM cents per tonne. */
  basePriceCents: number;
  npc: { volumeTph: number; demandElasticity: number; supplyElasticity: number };
  crate: CrateShape;
  necessity: Necessity | null;
}

type Row = [GoodId, string, GoodGroup, number, number, number, number, CrateShape, Necessity?];

// id, name, group, LM/t, NPC t/h, demand elasticity, supply elasticity, crate, necessity
const ROWS: Row[] = [
  ['regolith', 'Lunar regolith', 'raw', 15, 480, 0.8, 0.5, 'ore'],
  ['ilmenite', 'Ilmenite', 'raw', 60, 160, 0.8, 0.5, 'ore'],
  ['anorthite', 'Anorthite', 'raw', 45, 160, 0.8, 0.5, 'ore'],
  ['helium3', 'Helium-3', 'raw', 60000, 0.2, 1.5, 0.5, 'liquid'],
  ['kreep', 'KREEP ore', 'raw', 180, 40, 0.8, 0.5, 'ore'],
  ['polarVolatiles', 'Polar volatiles', 'raw', 120, 60, 0.8, 0.5, 'liquid'],
  ['steel', 'Steel', 'refined', 400, 48, 1.0, 0.6, 'ingot'],
  ['titaniumAlloy', 'Titanium alloy', 'refined', 2400, 6, 1.0, 0.6, 'ingot'],
  ['aluminium', 'Aluminium', 'refined', 900, 16, 1.0, 0.6, 'ingot'],
  ['sinteredConcrete', 'Sintered concrete', 'refined', 80, 120, 1.0, 0.6, 'crate'],
  ['glass', 'Glass', 'refined', 300, 32, 1.0, 0.6, 'panel'],
  ['siliconWafers', 'Silicon wafers', 'refined', 6000, 1.6, 1.0, 0.6, 'panel'],
  ['rareEarthOxides', 'Rare-earth oxides', 'refined', 3500, 3.2, 1.0, 0.6, 'crate'],
  ['oxygen', 'Oxygen', 'refined', 350, 24, 0.15, 0.6, 'liquid', 'air'],
  ['potableWater', 'Potable water', 'refined', 250, 32, 0.15, 0.6, 'liquid', 'water'],
  ['hydrogen', 'Hydrogen', 'refined', 1800, 4.8, 1.0, 0.6, 'liquid'],
  ['fertiliser', 'Fertiliser', 'refined', 1500, 4, 1.0, 0.6, 'crate'],
  ['hydroponicProduce', 'Hydroponic produce', 'refined', 4000, 2.4, 0.15, 0.6, 'crate', 'food'],
  ['electronics', 'Electronics', 'component', 45000, 1.2, 1.2, 0.8, 'crate'],
  ['machinery', 'Machinery', 'component', 12000, 6, 1.2, 0.4, 'crate'],
  ['prefabStructures', 'Prefab structures', 'component', 400, 40, 1.2, 0.4, 'crate'],
  ['solarPanels', 'Solar panels', 'component', 9000, 2.4, 1.2, 0.4, 'panel'],
];

export const GOODS = Object.fromEntries(
  ROWS.map(([id, name, group, lm, tph, ed, es, crate, necessity]) => [
    id,
    {
      id,
      name,
      group,
      basePriceCents: lm * 100,
      npc: { volumeTph: tph, demandElasticity: ed, supplyElasticity: es },
      crate,
      necessity: necessity ?? null,
    },
  ]),
) as Record<GoodId, GoodDef>;

export const GOOD_IDS: GoodId[] = ROWS.map((r) => r[0]);

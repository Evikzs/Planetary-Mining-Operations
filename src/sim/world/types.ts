import type { Terrain } from '../../shared/terrain';
import type { Vec3 } from '../../shared/vec3';

export type RawGoodId =
  'regolith' | 'ilmenite' | 'anorthite' | 'helium3' | 'kreep' | 'polarVolatiles';

export const RAW_GOODS: RawGoodId[] = [
  'regolith',
  'ilmenite',
  'anorthite',
  'helium3',
  'kreep',
  'polarVolatiles',
];

export interface Section {
  id: number;
  center: Vec3;
  neighbors: number[];
  polygon: Vec3[];
  hubPlotId: number;
}

export type PlotKind = 'hub' | 'deposit' | 'build' | 'public';

export interface Plot {
  id: number;
  sectionId: number;
  kind: PlotKind;
  dir: Vec3;
  slope: number;
  deposit: { goodId: RawGoodId; richness: number } | null;
}

export interface World {
  bodyId: 'luna';
  radius: number;
  sections: Section[];
  plots: Plot[];
  foundingSectionId: number;
  /** Non-enumerable so the world can be hashed and compared as data. */
  readonly terrain: Terrain;
}

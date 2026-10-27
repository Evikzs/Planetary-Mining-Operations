import { createTerrain } from '../../shared/terrain';
import { LUNA_RADIUS } from '../../shared/scale';
import { latLon } from '../../shared/vec3';
import { placeDeposits, generatePlots, type PlotAccept } from './plots';
import { generateSections } from './sections';
import type { RawGoodId, World } from './types';

const SECTION_COUNT = 60;
const FOUNDING_GOODS: RawGoodId[] = ['regolith', 'ilmenite', 'polarVolatiles'];

export function generateLuna(seed: number, accept?: PlotAccept): World {
  const terrain = createTerrain(seed, LUNA_RADIUS);
  const bare = generateSections(seed, SECTION_COUNT);
  const { plots, hubPlotIds, ctx } = generatePlots(seed, terrain, bare, accept);
  const sections = bare.map((s, i) => ({ ...s, hubPlotId: hubPlotIds[i]! }));

  // Founding charter: the south-polar section richest in ice, iron and dirt.
  const polar = sections.filter((s) => latLon(s.center).lat <= (-60 * Math.PI) / 180);
  const score = (id: number) =>
    plots
      .filter((p) => p.sectionId === id && p.deposit && FOUNDING_GOODS.includes(p.deposit.goodId))
      .reduce((sum, p) => sum + (p.deposit?.richness ?? 0), 0);
  const founding = polar.reduce((best, s) => (score(s.id) > score(best.id) ? s : best));
  const hub = plots[founding.hubPlotId]!.dir;
  for (const good of FOUNDING_GOODS) {
    const has = plots.some((p) => p.sectionId === founding.id && p.deposit?.goodId === good);
    if (!has && placeDeposits(ctx, founding, hub, good, 1, true) === 0) {
      throw new Error(`founding section ${founding.id}: no room for a ${good} deposit`);
    }
  }

  const world = {
    bodyId: 'luna' as const,
    radius: LUNA_RADIUS,
    sections,
    plots,
    foundingSectionId: founding.id,
  };
  Object.defineProperty(world, 'terrain', { value: terrain, enumerable: false });
  return world as World;
}

const cache = new Map<number, World>();

/** The world is derived from the seed, so state never stores it; this caches one per seed. */
export function worldOf(state: { seed: number }): World {
  let world = cache.get(state.seed);
  if (!world) {
    world = generateLuna(state.seed);
    cache.set(state.seed, world);
  }
  return world;
}

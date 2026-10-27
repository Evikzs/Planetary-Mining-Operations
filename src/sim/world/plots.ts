import { createNoise, fbm, type Noise3 } from '../../shared/noise';
import { LUNA_RADIUS, MAX_PLOT_SLOPE, PLOT_SPACING, SETTLEMENT_RADIUS } from '../../shared/scale';
import type { Terrain } from '../../shared/terrain';
import {
  angleBetween,
  latLon,
  localToDir,
  normalize,
  scale,
  tangentBasis,
  type Vec3,
} from '../../shared/vec3';
import { createRng, deriveSeed, type Rng } from '../rng';
import { sectionAt } from './sections';
import { RAW_GOODS, type Plot, type RawGoodId, type Section } from './types';

export type PlotAccept = (sectionId: number, hub: Vec3, candidate: Vec3) => boolean;

const BUILD_PLOTS = 12;
const PUBLIC_PLOTS = 2;
const DEPOSIT_CANDIDATES = 64;
const MAX_ATTEMPTS = 4000;
const POLAR_LAT = (60 * Math.PI) / 180;
const KREEP_REACH = (50 * Math.PI) / 180;
const THRESHOLD: Record<RawGoodId, number> = {
  regolith: 0,
  ilmenite: 0.35,
  anorthite: 0.35,
  helium3: 0.45,
  kreep: 0.5,
  polarVolatiles: 0.5,
};

type SectionLike = Omit<Section, 'hubPlotId'>;

export interface PlotContext {
  radius: number;
  terrain: Terrain;
  sections: SectionLike[];
  accept: PlotAccept;
  rng: Rng;
  plots: Plot[];
  value(good: RawGoodId, dir: Vec3): number;
}

export function createPlotContext(
  seed: number,
  terrain: Terrain,
  sections: SectionLike[],
  accept: PlotAccept = () => true,
  radius = LUNA_RADIUS,
): PlotContext {
  const fields = Object.fromEntries(
    RAW_GOODS.map((g) => [g, createNoise(seed, `deposit:${g}`)]),
  ) as Record<RawGoodId, Noise3>;
  const terraneRng = createRng(deriveSeed(seed, 'terrane'));
  const terrane = normalize([
    terraneRng.next() * 2 - 1,
    terraneRng.next() * 2 - 1,
    terraneRng.next() * 2 - 1,
  ]);
  return {
    radius,
    terrain,
    sections,
    accept,
    rng: createRng(deriveSeed(seed, 'plots')),
    plots: [],
    value(good, dir) {
      const n01 = (fbm(fields[good], scale(dir, 12), 2) + 1) / 2;
      switch (good) {
        case 'ilmenite':
        case 'helium3':
          return n01 * terrain.mariaMask(dir);
        case 'anorthite':
          return n01 * (1 - terrain.mariaMask(dir));
        case 'kreep':
          return angleBetween(dir, terrane) <= KREEP_REACH ? n01 : 0;
        case 'polarVolatiles':
          return Math.abs(latLon(dir).lat) >= POLAR_LAT ? n01 : 0;
        case 'regolith':
          return n01;
      }
    },
  };
}

function inDisk(ctx: PlotContext, hub: Vec3, maxR: number): Vec3 {
  const r = maxR * Math.sqrt(ctx.rng.next());
  const t = 2 * Math.PI * ctx.rng.next();
  return localToDir(hub, tangentBasis(hub), r * Math.cos(t), r * Math.sin(t), ctx.radius);
}

function fits(ctx: PlotContext, sectionId: number, hub: Vec3, dir: Vec3): boolean {
  for (const p of ctx.plots) {
    if (p.sectionId === sectionId && angleBetween(p.dir, dir) * ctx.radius < PLOT_SPACING) {
      return false;
    }
  }
  return (
    sectionAt(ctx.sections, dir) === sectionId &&
    ctx.terrain.slopeAt(dir) < MAX_PLOT_SLOPE &&
    ctx.accept(sectionId, hub, dir)
  );
}

function addPlot(ctx: PlotContext, plot: Omit<Plot, 'id' | 'slope'>): Plot {
  const full = { ...plot, id: ctx.plots.length, slope: ctx.terrain.slopeAt(plot.dir) };
  ctx.plots.push(full);
  return full;
}

function placeScattered(
  ctx: PlotContext,
  section: SectionLike,
  hub: Vec3,
  kind: 'build' | 'public',
  n: number,
): void {
  let placed = 0;
  for (let attempt = 0; placed < n && attempt < MAX_ATTEMPTS; attempt++) {
    const dir = inDisk(ctx, hub, SETTLEMENT_RADIUS);
    if (!fits(ctx, section.id, hub, dir)) continue;
    addPlot(ctx, { sectionId: section.id, kind, dir, deposit: null });
    placed++;
  }
  if (placed < n) throw new Error(`section ${section.id}: placed ${placed} of ${n} ${kind} plots`);
}

/** Up to `max` deposits of one good at the richest valid candidates. Returns how many. */
export function placeDeposits(
  ctx: PlotContext,
  section: SectionLike,
  hub: Vec3,
  good: RawGoodId,
  max: number,
  forced: boolean,
): number {
  const candidates = Array.from({ length: DEPOSIT_CANDIDATES }, () => {
    const dir = inDisk(ctx, hub, SETTLEMENT_RADIUS);
    return { dir, v: ctx.value(good, dir) };
  }).sort((a, b) => b.v - a.v);
  const threshold = THRESHOLD[good];
  let placed = 0;
  for (const c of candidates) {
    if (placed >= max) break;
    if (!forced && (good === 'regolith' ? false : c.v <= threshold)) break;
    if (good === 'polarVolatiles' && Math.abs(latLon(c.dir).lat) < POLAR_LAT) continue;
    if (!fits(ctx, section.id, hub, c.dir)) continue;
    const richness =
      forced || good === 'regolith'
        ? 1
        : 0.6 + Math.min(1, Math.max(0, (c.v - threshold) / (1 - threshold)));
    addPlot(ctx, {
      sectionId: section.id,
      kind: 'deposit',
      dir: c.dir,
      deposit: { goodId: good, richness },
    });
    placed++;
  }
  return placed;
}

export function generatePlots(
  seed: number,
  terrain: Terrain,
  sections: SectionLike[],
  accept?: PlotAccept,
): { plots: Plot[]; hubPlotIds: number[]; ctx: PlotContext } {
  const ctx = createPlotContext(seed, terrain, sections, accept);
  const hubPlotIds: number[] = [];
  for (const section of sections) {
    const candidates = [
      section.center,
      ...Array.from({ length: 15 }, () => inDisk(ctx, section.center, 3)),
    ].filter((d) => sectionAt(sections, d) === section.id);
    const hub = candidates.reduce((best, d) =>
      terrain.slopeAt(d) < terrain.slopeAt(best) ? d : best,
    );
    hubPlotIds.push(
      addPlot(ctx, { sectionId: section.id, kind: 'hub', dir: hub, deposit: null }).id,
    );
    placeScattered(ctx, section, hub, 'build', BUILD_PLOTS);
    placeScattered(ctx, section, hub, 'public', PUBLIC_PLOTS);
    for (const good of RAW_GOODS) {
      const n = placeDeposits(ctx, section, hub, good, good === 'regolith' ? 1 : 2, false);
      if (good === 'regolith' && n === 0) placeDeposits(ctx, section, hub, good, 1, true);
    }
  }
  return { plots: ctx.plots, hubPlotIds, ctx };
}

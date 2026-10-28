import { describe, expect, it } from 'vitest';
import { worldOf } from '../../../src/sim/world/luna';
import {
  buildSectionGrid,
  cellOf,
  connectToNetwork,
  createRoadNet,
  roadPath,
  smooth,
  type WorldLike,
} from '../../../src/sim/world/roads';
import type { Terrain } from '../../../src/shared/terrain';
import { angleBetween, localToDir, tangentBasis, type Vec3 } from '../../../src/shared/vec3';

const world = worldOf({ seed: 42 });
const sid = world.foundingSectionId;
const hub = world.plots[world.sections[sid]!.hubPlotId]!.dir;
const sectionPlots = world.plots.filter((p) => p.sectionId === sid && p.kind !== 'hub');

function idGen() {
  let n = 1;
  return () => n++;
}

describe('roads', () => {
  const grid = buildSectionGrid(world, sid, hub);

  it('generated build, deposit and public plots are all reachable from the hub', () => {
    for (const s of world.sections.slice(0, 12)) {
      const h = world.plots[s.hubPlotId]!.dir;
      const g = buildSectionGrid(world, s.id, h);
      for (const p of world.plots.filter((x) => x.sectionId === s.id)) {
        const cell = cellOf(g, p.dir);
        expect(cell).not.toBeNull();
        expect(g.hubComponent[cell!], `plot ${p.id}`).toBe(1);
      }
    }
  });

  it('never routes through a cell steeper than 0.35', () => {
    const net = createRoadNet(grid);
    const next = idGen();
    for (const p of sectionPlots) {
      const line = connectToNetwork(grid, net, p.dir, next);
      expect(line).not.toBeNull();
      for (const c of line!.cells) expect(grid.passable[c]).toBe(1);
    }
  });

  it('grows the network: the second road ends on an existing road cell', () => {
    const net = createRoadNet(grid);
    const next = idGen();
    connectToNetwork(grid, net, sectionPlots[0]!.dir, next);
    const before = new Set(net.roadCells);
    const second = connectToNetwork(grid, net, sectionPlots[1]!.dir, next)!;
    expect(before.has(second.cells[second.cells.length - 1]!)).toBe(true);
    expect(net.polylines).toHaveLength(2);
  });

  it('roadPath follows road cells only and length ≥ straight distance', () => {
    const net = createRoadNet(grid);
    const next = idGen();
    for (const p of sectionPlots.slice(0, 4)) connectToNetwork(grid, net, p.dir, next);
    const a = sectionPlots[0]!.dir;
    const b = sectionPlots[3]!.dir;
    const path = roadPath(grid, net, a, b)!;
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThanOrEqual(angleBetween(a, b) * world.radius - 0.5);
    const roads = new Set(net.roadCells);
    for (const c of path.cells) expect(roads.has(c)).toBe(true);
  });

  it('returns null when the target is walled off', () => {
    const center: Vec3 = [0, 0, 1];
    const basis = tangentBasis(center);
    const target = localToDir(center, basis, 6, 0, 100);
    const wall: Terrain = {
      height: (d) => {
        const r = angleBetween(d, target) * 100;
        return r > 1.5 && r < 2.5 ? 3 : 0;
      },
      mariaMask: () => 0,
      surfaceClass: () => 0,
      slopeAt: () => 0,
    };
    const fake: WorldLike = { radius: 100, terrain: wall, sections: [{ center }], plots: [] };
    const g = buildSectionGrid(fake, 0, center);
    expect(connectToNetwork(g, createRoadNet(g), target, idGen())).toBeNull();
  });

  it('smooth keeps endpoints', () => {
    const pts = [0, 1, 2, 3].map((x) => localToDir(hub, tangentBasis(hub), x, x % 2, 100));
    const out = smooth(pts, 100);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[3]);
  });

  it('builds a grid in < 40 ms and connects in < 15 ms', () => {
    const other = world.sections[(sid + 1) % world.sections.length]!;
    const h = world.plots[other.hubPlotId]!.dir;
    const target = world.plots.find((p) => p.sectionId === other.id && p.kind === 'build')!;
    // The fastest of a few runs is the cost: other test files share the CPU, and that only adds time.
    const fastest = (run: () => void): number => {
      let best = Infinity;
      for (let k = 0; k < 5; k++) {
        const t = performance.now();
        run();
        best = Math.min(best, performance.now() - t);
      }
      return best;
    };
    const g = buildSectionGrid(world, other.id, h);
    expect(fastest(() => buildSectionGrid(world, other.id, h))).toBeLessThan(40);
    expect(fastest(() => connectToNetwork(g, createRoadNet(g), target.dir, idGen()))).toBeLessThan(
      15,
    );
  });
});

import { MAX_ROAD_SLOPE } from '../../shared/scale';
import type { Terrain } from '../../shared/terrain';
import {
  add,
  angleBetween,
  dot,
  len,
  localToDir,
  normalize,
  scale,
  sub,
  tangentBasis,
  dirToLocal,
  type Vec3,
} from '../../shared/vec3';
import { sectionAt } from './sections';

export const GRID_CELL = 0.25;
export const GRID_SIZE = 113; // ±14 units around the hub
const HALF = (GRID_SIZE - 1) / 2;
const REACH = 14; // world units; cells beyond are never passable
const NEAR_PLOT = 0.6;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export interface WorldLike {
  radius: number;
  terrain: Terrain;
  sections: readonly { center: Vec3 }[];
  plots: readonly { sectionId: number; dir: Vec3 }[];
}

export interface SectionGrid {
  sectionId: number;
  hub: Vec3;
  basis: { east: Vec3; north: Vec3 };
  radius: number;
  passable: Uint8Array;
  /** Per-cell step multiplier: 1 + 4·slope², tripled next to plots. */
  cost: Float32Array;
  nearPlot: Uint8Array;
  hubComponent: Uint8Array;
  plotDirs: Vec3[];
}

export interface Polyline {
  id: number;
  cells: number[];
  points: Vec3[];
}

export interface RoadNet {
  sectionId: number;
  roadCells: number[];
  polylines: Polyline[];
}

/** Lazy per-cell terrain facts. One rule for passability, shared by world-gen and road building. */
export class GridSampler {
  private readonly heights = new Float32Array(GRID_SIZE * GRID_SIZE).fill(Number.NaN);
  private readonly insideCache = new Int8Array(GRID_SIZE * GRID_SIZE).fill(-1);
  readonly basis: { east: Vec3; north: Vec3 };
  readonly hubCell: number;

  constructor(
    readonly world: WorldLike,
    readonly sectionId: number,
    readonly hub: Vec3,
  ) {
    this.basis = tangentBasis(hub);
    this.hubCell = HALF * GRID_SIZE + HALF;
  }

  dir(cell: number): Vec3 {
    const i = cell % GRID_SIZE;
    const j = Math.floor(cell / GRID_SIZE);
    return localToDir(
      this.hub,
      this.basis,
      (i - HALF) * GRID_CELL,
      (j - HALF) * GRID_CELL,
      this.world.radius,
    );
  }

  cellOf(dir: Vec3): number | null {
    if (dot(dir, this.hub) <= 0) return null;
    const { x, y } = dirToLocal(this.hub, this.basis, dir, this.world.radius);
    const i = Math.round(x / GRID_CELL) + HALF;
    const j = Math.round(y / GRID_CELL) + HALF;
    if (i < 0 || j < 0 || i >= GRID_SIZE || j >= GRID_SIZE) return null;
    return j * GRID_SIZE + i;
  }

  height(cell: number): number {
    let h = this.heights[cell]!;
    if (Number.isNaN(h)) {
      h = this.world.terrain.height(this.dir(cell));
      this.heights[cell] = h;
    }
    return h;
  }

  private inside(cell: number): boolean {
    let v = this.insideCache[cell]!;
    if (v < 0) {
      const i = (cell % GRID_SIZE) - HALF;
      const j = Math.floor(cell / GRID_SIZE) - HALF;
      const near = Math.hypot(i, j) * GRID_CELL <= REACH;
      v = near && sectionAt(this.world.sections, this.dir(cell)) === this.sectionId ? 1 : 0;
      this.insideCache[cell] = v;
    }
    return v === 1;
  }

  slope(cell: number): number {
    const i = cell % GRID_SIZE;
    const j = Math.floor(cell / GRID_SIZE);
    const h = this.height(cell);
    let max = 0;
    for (const [di, dj] of DIRS.slice(0, 4)) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GRID_SIZE || nj >= GRID_SIZE) continue;
      max = Math.max(max, Math.abs(this.height(nj * GRID_SIZE + ni) - h) / GRID_CELL);
    }
    return max;
  }

  passable(cell: number): boolean {
    if (cell === this.hubCell) return true;
    return this.inside(cell) && this.slope(cell) <= MAX_ROAD_SLOPE;
  }

  /** True when the straight 8-connected cell line from the hub is passable: a road is then certain. */
  lineReachable(dir: Vec3): boolean {
    const end = this.cellOf(dir);
    if (end === null) return false;
    let i = HALF;
    let j = HALF;
    const i1 = end % GRID_SIZE;
    const j1 = Math.floor(end / GRID_SIZE);
    const di = Math.abs(i1 - i);
    const dj = Math.abs(j1 - j);
    const si = i < i1 ? 1 : -1;
    const sj = j < j1 ? 1 : -1;
    let err = di - dj;
    for (;;) {
      if (!this.passable(j * GRID_SIZE + i)) return false;
      if (i === i1 && j === j1) return true;
      const e2 = 2 * err;
      if (e2 > -dj) {
        err -= dj;
        i += si;
      }
      if (e2 < di) {
        err += di;
        j += sj;
      }
    }
  }
}

const gridCache = new WeakMap<WorldLike, Map<number, SectionGrid>>();

export function buildSectionGrid(world: WorldLike, sectionId: number, hub: Vec3): SectionGrid {
  const cached = gridCache.get(world)?.get(sectionId);
  if (cached && cached.hub === hub) return cached;
  const sampler = new GridSampler(world, sectionId, hub);
  const n = GRID_SIZE * GRID_SIZE;
  const passable = new Uint8Array(n);
  const cost = new Float32Array(n);
  const nearPlot = new Uint8Array(n);
  const plotDirs = world.plots.filter((p) => p.sectionId === sectionId).map((p) => p.dir);
  for (const pd of plotDirs) {
    const c = sampler.cellOf(pd);
    if (c === null) continue;
    const ci = c % GRID_SIZE;
    const cj = Math.floor(c / GRID_SIZE);
    const r = Math.ceil(NEAR_PLOT / GRID_CELL);
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= GRID_SIZE || j >= GRID_SIZE) continue;
        if (Math.hypot(i - ci, j - cj) * GRID_CELL <= NEAR_PLOT) nearPlot[j * GRID_SIZE + i] = 1;
      }
    }
  }
  for (let c = 0; c < n; c++) {
    const i = (c % GRID_SIZE) - HALF;
    const j = Math.floor(c / GRID_SIZE) - HALF;
    if (Math.hypot(i, j) * GRID_CELL > REACH) continue;
    if (!sampler.passable(c)) continue;
    passable[c] = 1;
    const s = sampler.slope(c);
    cost[c] = (1 + 4 * s * s) * (nearPlot[c] ? 3 : 1);
  }
  const hubComponent = new Uint8Array(n);
  const queue = [sampler.hubCell];
  hubComponent[sampler.hubCell] = 1;
  while (queue.length) {
    const c = queue.pop()!;
    for (const nb of neighbors(c)) {
      if (passable[nb] && !hubComponent[nb]) {
        hubComponent[nb] = 1;
        queue.push(nb);
      }
    }
  }
  const grid: SectionGrid = {
    sectionId,
    hub,
    basis: sampler.basis,
    radius: world.radius,
    passable,
    cost,
    nearPlot,
    hubComponent,
    plotDirs,
  };
  const perWorld = gridCache.get(world) ?? new Map<number, SectionGrid>();
  perWorld.set(sectionId, grid);
  gridCache.set(world, perWorld);
  return grid;
}

function* neighbors(c: number): Generator<number> {
  const i = c % GRID_SIZE;
  const j = Math.floor(c / GRID_SIZE);
  for (const [di, dj] of DIRS) {
    const ni = i + di;
    const nj = j + dj;
    if (ni >= 0 && nj >= 0 && ni < GRID_SIZE && nj < GRID_SIZE) yield nj * GRID_SIZE + ni;
  }
}

const stepLen = (a: number, b: number) =>
  a % GRID_SIZE !== b % GRID_SIZE && Math.floor(a / GRID_SIZE) !== Math.floor(b / GRID_SIZE)
    ? GRID_CELL * Math.SQRT2
    : GRID_CELL;

export function cellOf(g: SectionGrid, dir: Vec3): number | null {
  if (dot(dir, g.hub) <= 0) return null;
  const { x, y } = dirToLocal(g.hub, g.basis, dir, g.radius);
  const i = Math.round(x / GRID_CELL) + HALF;
  const j = Math.round(y / GRID_CELL) + HALF;
  if (i < 0 || j < 0 || i >= GRID_SIZE || j >= GRID_SIZE) return null;
  return j * GRID_SIZE + i;
}

function cellDir(g: SectionGrid, cell: number): Vec3 {
  const i = cell % GRID_SIZE;
  const j = Math.floor(cell / GRID_SIZE);
  return localToDir(g.hub, g.basis, (i - HALF) * GRID_CELL, (j - HALF) * GRID_CELL, g.radius);
}

export function createRoadNet(g: SectionGrid): RoadNet {
  return { sectionId: g.sectionId, roadCells: [HALF * GRID_SIZE + HALF], polylines: [] };
}

/** Binary min-heap of [priority, cell]. */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(p: number, c: number) {
    const a = this.items;
    a.push([p, c]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]![0] <= a[i]![0]) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

function insertSorted(list: number[], cells: number[]): void {
  const set = new Set(list);
  for (const c of cells) set.add(c);
  list.splice(0, list.length, ...[...set].sort((a, b) => a - b));
}

/** Routes a road from a plot to the nearest existing road cell (Dijkstra). */
export function connectToNetwork(
  g: SectionGrid,
  net: RoadNet,
  from: Vec3,
  newId: () => number,
): Polyline | null {
  const start = cellOf(g, from);
  if (start === null || !g.passable[start]) return null;
  const roads = new Set(net.roadCells);
  if (roads.has(start)) {
    const line = { id: newId(), cells: [start], points: [from] };
    net.polylines.push(line);
    return line;
  }
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const heap = new Heap();
  heap.push(0, start);
  let goal: number | null = null;
  while (heap.size) {
    const [d, c] = heap.pop();
    if (d > (dist.get(c) ?? Infinity)) continue;
    if (roads.has(c)) {
      goal = c;
      break;
    }
    for (const nb of neighbors(c)) {
      if (!g.passable[nb]) continue;
      const nearStart = angleBetween(cellDir(g, nb), from) * g.radius <= NEAR_PLOT;
      const mult = nearStart && g.nearPlot[nb] ? g.cost[nb]! / 3 : g.cost[nb]!;
      const nd = d + stepLen(c, nb) * mult;
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd);
        prev.set(nb, c);
        heap.push(nd, nb);
      }
    }
  }
  if (goal === null) return null;
  const cells = [goal];
  while (cells[cells.length - 1] !== start) cells.push(prev.get(cells[cells.length - 1]!)!);
  cells.reverse();
  const points = smooth([from, ...cells.slice(1).map((c) => cellDir(g, c))], g.radius);
  const line = { id: newId(), cells, points };
  net.polylines.push(line);
  insertSorted(net.roadCells, cells);
  return line;
}

/** Shortest path along existing road cells (A*). */
export function roadPath(
  g: SectionGrid,
  net: RoadNet,
  from: Vec3,
  to: Vec3,
): { cells: number[]; points: Vec3[]; length: number } | null {
  const roads = new Set(net.roadCells);
  const start = cellOf(g, from);
  const goal = cellOf(g, to);
  if (start === null || goal === null || !roads.has(start) || !roads.has(goal)) return null;
  const gi = goal % GRID_SIZE;
  const gj = Math.floor(goal / GRID_SIZE);
  const h = (c: number) => {
    const dx = Math.abs((c % GRID_SIZE) - gi);
    const dy = Math.abs(Math.floor(c / GRID_SIZE) - gj);
    return GRID_CELL * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
  };
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const heap = new Heap();
  heap.push(h(start), start);
  while (heap.size) {
    const [, c] = heap.pop();
    if (c === goal) break;
    const d = dist.get(c)!;
    for (const nb of neighbors(c)) {
      if (!roads.has(nb)) continue;
      const nd = d + stepLen(c, nb);
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd);
        prev.set(nb, c);
        heap.push(nd + h(nb), nb);
      }
    }
  }
  if (!dist.has(goal)) return null;
  const cells = [goal];
  while (cells[cells.length - 1] !== start) cells.push(prev.get(cells[cells.length - 1]!)!);
  cells.reverse();
  const points = smooth([from, ...cells.slice(1, -1).map((c) => cellDir(g, c)), to], g.radius);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += len(sub(points[i]!, points[i - 1]!)) * g.radius;
  return { cells, points, length };
}

function rdp(points: Vec3[], tol: number): Vec3[] {
  if (points.length <= 2) return points;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const ab = sub(b, a);
  const abLen = len(ab);
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const ap = sub(points[i]!, a);
    const d = abLen === 0 ? len(ap) : len(sub(ap, scale(ab, dot(ap, ab) / (abLen * abLen))));
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tol) return [a, b];
  return [...rdp(points.slice(0, index + 1), tol).slice(0, -1), ...rdp(points.slice(index), tol)];
}

/** Simplifies (RDP, 0.15 units) and resamples with a centripetal Catmull-Rom spline every 0.2 units. */
export function smooth(points: Vec3[], radius: number): Vec3[] {
  if (points.length <= 2) return [...points];
  const key = rdp(points, 0.15 / radius);
  if (key.length <= 2) return [...key];
  const out: Vec3[] = [];
  const spacing = 0.2 / radius;
  for (let k = 0; k < key.length - 1; k++) {
    const p0 = key[Math.max(0, k - 1)]!;
    const p1 = key[k]!;
    const p2 = key[k + 1]!;
    const p3 = key[Math.min(key.length - 1, k + 2)]!;
    const steps = Math.max(1, Math.ceil(len(sub(p2, p1)) / spacing));
    for (let s = 0; s < steps; s++) out.push(normalize(catmullRom(p0, p1, p2, p3, s / steps)));
  }
  out.push(points[points.length - 1]!);
  out[0] = points[0]!;
  return out;
}

function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const knot = (a: Vec3, b: Vec3) => Math.max(1e-12, Math.sqrt(len(sub(b, a))));
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: Vec3, b: Vec3, ta: number, tb: number) =>
    add(scale(a, (tb - u) / (tb - ta)), scale(b, (u - ta) / (tb - ta)));
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

import {
  BoxGeometry,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { GOODS, type GoodGroup, type GoodId } from '../../data/goods';
import { MINERALS } from '../../data/minerals';
import { cratePositions } from '../../shared/lanes';
import { BELT_SPEED } from '../../shared/scale';
import type { Terrain } from '../../shared/terrain';
import { add, angleBetween, cross, normalize, scale, sub, type Vec3 } from '../../shared/vec3';
import type { MotionView, WorldView } from '../../sim/views';
import type { RawGoodId } from '../../sim/world/types';
import { ink, kit } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { DEFAULT_FILTER, filterTint, type MapFilter } from '../overlays/filters';
import { kitMaterial, METRES_PER_UNIT, type SceneUniforms } from './kit';
import { visibleLayers } from './lod';
import { beltSegmentGeometry, pylonGeometry } from './models';

const M = 1 / METRES_PER_UNIT;
/** The belt top stands this high over the ground (2.5 m). */
const LIFT = 2.5 * M;
const PYLON_STEP = 22 * M;
const LANE_OFFSET = 0.5 * M;
const NEAR_TARGET = 12;
const SPACING = BELT_SPEED * 1;
const WHITE = new Color(1, 1, 1);

/** Paint for refined goods (slabs) and components (crates), by good. */
const REFINED = [kit.steel, kit.ceramic, kit.bone, kit.ceramicDark] as const;
const COMPONENT = [kit.rust, kit.teal, kit.ochre, kit.orange, kit.ceramic] as const;

const hashOf = (id: string): number =>
  [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The colour a good rides in: its mineral's glint if raw, else paint by group. */
export function crateColour(goodId: GoodId): string {
  const g = GOODS[goodId].group;
  if (g === 'raw') return MINERALS[goodId as RawGoodId]?.color ?? kit.rock;
  const paints = g === 'refined' ? REFINED : COMPONENT;
  return paints[hashOf(goodId) % paints.length]!;
}

interface BeltShape {
  dirs: Vec3[];
  heights: number[];
  /** Arc length to each point, in world units. */
  cum: number[];
  length: number;
  mid: Vec3;
  /** Instances of this belt's segments in the shared segment mesh. */
  first: number;
  count: number;
}

/** Fable's raised conveyors from each building to its hub, on pylons, and what rides them. */
export class BeltLayer {
  private readonly belts = new Map<number, BeltShape>();
  private lanes: MotionView['lanes'] = [];
  private filter: MapFilter = DEFAULT_FILTER;
  private readonly segmentGeometry = beltSegmentGeometry().scale(M, M, 1);
  private readonly pylonGeometry = pylonGeometry().scale(M, 1, M);
  private readonly material: Material;
  private segments: InstancedMesh | null = null;
  private pylons: InstancedMesh | null = null;
  /** Raw goods ride as lumps that glow in their mineral's colour; the rest as slabs or crates. */
  private readonly crates: Record<GoodGroup, { geometry: BufferGeometry; mesh: InstancedMesh }>;
  private readonly lumpMaterial: Material;
  private readonly crateMaterial: Material;
  private readonly m = new Matrix4();
  private readonly color = new Color();
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly right = new Vector3();
  shown = 0;

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    u: SceneUniforms,
    private readonly reducedMotion: boolean,
  ) {
    this.material = kitMaterial(u);
    const lump = new MeshLambertMaterial({ flatShading: true });
    lump.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#ifdef USE_INSTANCING_COLOR
totalEmissiveRadiance += vColor * .55;
#endif`,
      );
    };
    this.lumpMaterial = lump;
    this.crateMaterial = new MeshLambertMaterial({ flatShading: true });
    const make = (geometry: BufferGeometry, material: Material) => ({
      geometry,
      mesh: this.crateMesh(geometry, material, 256),
    });
    this.crates = {
      raw: make(new IcosahedronGeometry(0.6 * M, 0), this.lumpMaterial),
      refined: make(
        new BoxGeometry(1.6 * M, 0.5 * M, 1 * M).translate(0, 0.25 * M, 0),
        this.crateMaterial,
      ),
      component: make(
        new BoxGeometry(1.3 * M, 1.3 * M, 1.3 * M).translate(0, 0.65 * M, 0),
        this.crateMaterial,
      ),
    };
  }

  setWorld(w: WorldView): void {
    const ids = new Set(w.belts.map((b) => b.id));
    for (const id of [...this.belts.keys()]) if (!ids.has(id)) this.belts.delete(id);
    for (const b of w.belts)
      if (!this.belts.has(b.id)) this.belts.set(b.id, this.shape(b.points, b.length));
    this.rebuild();
  }

  setMotion(m: MotionView): void {
    this.lanes = m.lanes;
  }

  setFilter(f: MapFilter): void {
    this.filter = f;
  }

  update(gameTime: number, view: GlobeCameraState): void {
    const layers = visibleLayers(view.altitude);
    if (this.segments) this.segments.visible = layers.buildings;
    if (this.pylons) this.pylons.visible = layers.buildings;
    if (layers.buildings) this.tint();
    for (const c of Object.values(this.crates)) c.mesh.visible = layers.crates;
    this.shown = layers.crates ? this.placeCrates(gameTime, view.pos) : 0;
  }

  dispose(): void {
    for (const mesh of [this.segments, this.pylons]) this.release(mesh);
    for (const c of Object.values(this.crates)) {
      this.release(c.mesh);
      c.geometry.dispose();
    }
    this.segmentGeometry.dispose();
    this.pylonGeometry.dispose();
    for (const m of [this.material, this.lumpMaterial, this.crateMaterial]) m.dispose();
  }

  private release(mesh: InstancedMesh | null): void {
    mesh?.removeFromParent();
    mesh?.dispose();
  }

  private shape(dirs: Vec3[], length: number): BeltShape {
    const heights = dirs.map((d) => this.terrain.height(d));
    const cum = [0];
    for (let i = 1; i < dirs.length; i++)
      cum.push(cum[i - 1]! + angleBetween(dirs[i - 1]!, dirs[i]!) * this.radius);
    return { dirs, heights, cum, length, mid: dirs[dirs.length >> 1]!, first: 0, count: 0 };
  }

  /** All belts in two instanced meshes: one stretched segment per span, a pylon every 22 m. */
  private rebuild(): void {
    const segs: Matrix4[] = [];
    const pylons: Matrix4[] = [];
    const a = new Vector3();
    const b = new Vector3();
    const up = new Vector3();
    const x = new Vector3();
    const z = new Vector3();
    for (const belt of this.belts.values()) {
      belt.first = segs.length;
      const top = (i: number, out: Vector3) =>
        out.set(...belt.dirs[i]!).multiplyScalar(this.radius + belt.heights[i]! + LIFT);
      for (let i = 1; i < belt.dirs.length; i++) {
        top(i - 1, a);
        top(i, b);
        const len = a.distanceTo(b);
        if (len < 1e-6) continue;
        up.set(...normalize(add(belt.dirs[i - 1]!, belt.dirs[i]!)));
        z.subVectors(b, a).normalize();
        x.crossVectors(up, z).normalize();
        up.crossVectors(z, x);
        segs.push(
          new Matrix4()
            .makeBasis(x, up, z)
            .scale(new Vector3(1, 1, len))
            .setPosition(a.clone().lerp(b, 0.5)),
        );
      }
      belt.count = segs.length - belt.first;
      for (let s = PYLON_STEP / 2; s < belt.length; s += PYLON_STEP) {
        const at = this.along(belt, s);
        const ground = this.radius + at.h;
        const d = new Vector3(...at.dir);
        const side = new Vector3(...normalize(cross(at.tangent, at.dir)));
        const fwd = new Vector3().crossVectors(d, side);
        pylons.push(
          new Matrix4()
            .makeBasis(side, d, fwd)
            .scale(new Vector3(1, LIFT - 1.2 * M, 1))
            .setPosition(d.clone().multiplyScalar(ground)),
        );
      }
    }
    this.release(this.segments);
    this.release(this.pylons);
    this.segments = this.instanced(this.segmentGeometry, segs);
    this.pylons = this.instanced(this.pylonGeometry, pylons);
    segs.forEach((_, i) => this.segments!.setColorAt(i, WHITE));
  }

  private instanced(geometry: BufferGeometry, matrices: Matrix4[]): InstancedMesh {
    const mesh = new InstancedMesh(geometry, this.material, Math.max(1, matrices.length));
    mesh.count = matrices.length;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.parent.add(mesh);
    return mesh;
  }

  /** White paint by default; under a local filter, by how full the belt runs or whether it jams. */
  private tint(): void {
    const seg = this.segments;
    if (!seg) return;
    const local = this.filter.local;
    const pulse = this.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(performance.now() / 160);
    for (const [id, b] of this.belts) {
      const lanes = this.lanes.filter((l) => l.beltId === id);
      if (local === 'throughput') {
        const fill = Math.max(0, ...lanes.map((l) => l.batches.length / (l.transitTicks + 1)));
        this.color.set(filterTint(fill, 0.5, 0.05));
      } else if (local === 'jams') {
        const jammed = lanes.some((l) => l.jammed);
        this.color.set(jammed ? ink.hazard : ink.dust);
        if (jammed) this.color.lerp(new Color(ink.lamp), 1 - pulse);
      } else this.color.copy(WHITE);
      for (let i = b.first; i < b.first + b.count; i++) seg.setColorAt(i, this.color);
    }
    if (seg.instanceColor) seg.instanceColor.needsUpdate = true;
  }

  /** What rides the lanes near the camera target: out lanes run to the hub, in lanes back. */
  private placeCrates(gameTime: number, target: Vec3): number {
    const near = this.lanes.flatMap((lane) => {
      const b = this.belts.get(lane.beltId);
      const close = b && angleBetween(b.mid, target) * this.radius <= NEAR_TARGET + b.length / 2;
      return close ? [{ lane, b }] : [];
    });
    const counts: Record<GoodGroup, number> = { raw: 0, refined: 0, component: 0 };
    for (const { lane } of near) {
      for (const batch of lane.batches) counts[GOODS[batch.goodId].group]++;
    }
    for (const g of Object.keys(counts) as GoodGroup[]) {
      while (this.crates[g].mesh.instanceMatrix.count < counts[g]) this.grow(g);
    }
    const k: Record<GoodGroup, number> = { raw: 0, refined: 0, component: 0 };
    for (const { lane, b } of near) {
      const side = lane.lane === 'out' ? LANE_OFFSET : -LANE_OFFSET;
      const spots = cratePositions(lane, gameTime, lane.transitTicks, b.length, SPACING);
      for (const [i, s] of spots.entries()) {
        const goodId = lane.batches[i]!.goodId;
        const group = GOODS[goodId].group;
        const at = this.along(b, lane.lane === 'out' ? s : b.length - s);
        const across = scale(normalize(cross(at.tangent, at.dir)), side);
        const p = add(scale(at.dir, this.radius + at.h + LIFT), across);
        this.fwd.set(...at.tangent);
        this.up.set(...at.dir);
        this.right.crossVectors(this.fwd, this.up);
        this.m.makeBasis(this.fwd, this.up, this.right).setPosition(p[0], p[1], p[2]);
        const mesh = this.crates[group].mesh;
        mesh.setMatrixAt(k[group], this.m);
        mesh.setColorAt(k[group], this.color.set(crateColour(goodId)));
        k[group]++;
      }
    }
    for (const g of Object.keys(k) as GoodGroup[]) {
      const mesh = this.crates[g].mesh;
      mesh.count = k[g];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return k.raw + k.refined + k.component;
  }

  /** Direction, ground height and heading at arc length s along a belt. */
  private along(b: BeltShape, s: number): { dir: Vec3; h: number; tangent: Vec3 } {
    const last = b.dirs.length - 1;
    let i = 0;
    while (i < last - 1 && b.cum[i + 1]! < s) i++;
    const span = b.cum[i + 1]! - b.cum[i]!;
    const f = span > 0 ? Math.min(1, Math.max(0, (s - b.cum[i]!) / span)) : 0;
    const [a, c] = [b.dirs[i]!, b.dirs[i + 1]!];
    return {
      dir: normalize(add(a, scale(sub(c, a), f))),
      h: b.heights[i]! + (b.heights[i + 1]! - b.heights[i]!) * f,
      tangent: normalize(sub(c, a)),
    };
  }

  private crateMesh(geometry: BufferGeometry, material: Material, capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, capacity);
    // Colours from the first frame, so the shader is built with them.
    mesh.setColorAt(0, WHITE);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    this.parent.add(mesh);
    return mesh;
  }

  private grow(group: GoodGroup): void {
    const c = this.crates[group];
    const bigger = this.crateMesh(
      c.geometry,
      c.mesh.material as Material,
      c.mesh.instanceMatrix.count * 2,
    );
    c.mesh.removeFromParent();
    c.mesh.dispose();
    c.mesh = bigger;
  }
}

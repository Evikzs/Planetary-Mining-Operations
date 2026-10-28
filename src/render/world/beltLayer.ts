import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  Uint32BufferAttribute,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import { GOODS, type GoodGroup } from '../../data/goods';
import { cratePositions } from '../../shared/lanes';
import { BELT_SPEED } from '../../shared/scale';
import type { Terrain } from '../../shared/terrain';
import { add, angleBetween, cross, normalize, scale, sub, type Vec3 } from '../../shared/vec3';
import type { MotionView, WorldView } from '../../sim/views';
import { bodyAccent, palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { DEFAULT_FILTER, filterTint, type MapFilter } from '../overlays/filters';
import { visibleLayers } from './lod';
import { ribbonGeometry } from './ribbon';

const WIDTH = 0.08;
const LIFT = 0.05;
const CRATE = 0.07;
const LANE_OFFSET = 0.02;
const NEAR_TARGET = 12;
const SPACING = BELT_SPEED * 1;
const GROUP_COLOR: Record<GoodGroup, string> = {
  raw: palette.burntOrange,
  refined: palette.teal,
  component: palette.mustard,
};

interface BeltShape {
  dirs: Vec3[];
  heights: number[];
  /** Arc length to each point, in world units. */
  cum: number[];
  length: number;
  mid: Vec3;
  mesh: Mesh;
  material: MeshToonMaterial;
}

/** Conveyor belts from each building to its hub, and the crates riding them. */
export class BeltLayer {
  private readonly belts = new Map<number, BeltShape>();
  private lanes: MotionView['lanes'] = [];
  private filter: MapFilter = DEFAULT_FILTER;
  private crates: InstancedMesh;
  private readonly crateGeometry = new BoxGeometry(CRATE, CRATE, CRATE);
  private readonly crateMaterial: MeshToonMaterial;
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
    private readonly gradientMap: Texture,
    private readonly reducedMotion: boolean,
  ) {
    this.crateMaterial = new MeshToonMaterial({ gradientMap });
    this.crates = this.crateMesh(512);
  }

  setWorld(w: WorldView): void {
    const ids = new Set(w.belts.map((b) => b.id));
    for (const id of this.belts.keys()) if (!ids.has(id)) this.remove(id);
    for (const b of w.belts)
      if (!this.belts.has(b.id)) this.belts.set(b.id, this.shape(b.points, b.length));
  }

  setMotion(m: MotionView): void {
    this.lanes = m.lanes;
  }

  setFilter(f: MapFilter): void {
    this.filter = f;
  }

  update(gameTime: number, view: GlobeCameraState): void {
    const layers = visibleLayers(view.altitude);
    for (const b of this.belts.values()) b.mesh.visible = layers.buildings;
    if (layers.buildings) this.tint();
    this.crates.visible = layers.crates;
    this.shown = layers.crates ? this.placeCrates(gameTime, view.pos) : 0;
  }

  dispose(): void {
    for (const id of [...this.belts.keys()]) this.remove(id);
    this.crates.removeFromParent();
    this.crates.dispose();
    this.crateGeometry.dispose();
    this.crateMaterial.dispose();
  }

  private remove(id: number): void {
    const b = this.belts.get(id)!;
    b.mesh.removeFromParent();
    b.mesh.geometry.dispose();
    b.material.dispose();
    this.belts.delete(id);
  }

  private shape(dirs: Vec3[], length: number): BeltShape {
    const heights = dirs.map((d) => this.terrain.height(d));
    const cum = [0];
    for (let i = 1; i < dirs.length; i++)
      cum.push(cum[i - 1]! + angleBetween(dirs[i - 1]!, dirs[i]!) * this.radius);
    const centre = dirs.map((d, i) => scale(d, this.radius + heights[i]! + LIFT));
    const r = ribbonGeometry(centre, dirs, WIDTH);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(r.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(r.normals, 3));
    g.setIndex(new Uint32BufferAttribute(r.indices, 1));
    const material = new MeshToonMaterial({ color: palette.rust, gradientMap: this.gradientMap });
    const mesh = new Mesh(g, material);
    this.parent.add(mesh);
    return { dirs, heights, cum, length, mid: dirs[dirs.length >> 1]!, mesh, material };
  }

  /** Rust by default; under a local filter, by how full the belt runs or whether it jams. */
  private tint(): void {
    const local = this.filter.local;
    const pulse = this.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(performance.now() / 160);
    for (const [id, b] of this.belts) {
      const lanes = this.lanes.filter((l) => l.beltId === id);
      if (local === 'throughput') {
        const fill = Math.max(0, ...lanes.map((l) => l.batches.length / (l.transitTicks + 1)));
        b.material.color.set(filterTint(fill, 0.5, 0.05));
      } else if (local === 'jams') {
        const jammed = lanes.some((l) => l.jammed);
        b.material.color.set(jammed ? palette.rust : bodyAccent.luna);
        if (jammed) b.material.color.lerp(this.color.set(palette.mustard), 1 - pulse);
      } else b.material.color.set(palette.rust);
    }
  }

  /** Crates on lanes near the camera target: out lanes run to the hub, in lanes back. */
  private placeCrates(gameTime: number, target: Vec3): number {
    const near = this.lanes.flatMap((lane) => {
      const b = this.belts.get(lane.beltId);
      const close = b && angleBetween(b.mid, target) * this.radius <= NEAR_TARGET + b.length / 2;
      return close ? [{ lane, b }] : [];
    });
    const total = near.reduce((n, x) => n + x.lane.batches.length, 0);
    while (this.crates.instanceMatrix.count < total) this.grow();
    let k = 0;
    for (const { lane, b } of near) {
      const side = lane.lane === 'out' ? LANE_OFFSET : -LANE_OFFSET;
      const spots = cratePositions(lane, gameTime, lane.transitTicks, b.length, SPACING);
      for (const [i, s] of spots.entries()) {
        const at = this.along(b, lane.lane === 'out' ? s : b.length - s);
        const across = scale(normalize(cross(at.tangent, at.dir)), side);
        const p = add(scale(at.dir, this.radius + at.h + LIFT + CRATE / 2), across);
        this.fwd.set(...at.tangent);
        this.up.set(...at.dir);
        this.right.crossVectors(this.fwd, this.up);
        this.m.makeBasis(this.fwd, this.up, this.right).setPosition(p[0], p[1], p[2]);
        this.crates.setMatrixAt(k, this.m);
        this.crates.setColorAt(
          k,
          this.color.set(GROUP_COLOR[GOODS[lane.batches[i]!.goodId].group]),
        );
        k++;
      }
    }
    this.crates.count = k;
    this.crates.instanceMatrix.needsUpdate = true;
    if (this.crates.instanceColor) this.crates.instanceColor.needsUpdate = true;
    return k;
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

  private crateMesh(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.crateGeometry, this.crateMaterial, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.parent.add(mesh);
    return mesh;
  }

  private grow(): void {
    const bigger = this.crateMesh(this.crates.instanceMatrix.count * 2);
    this.crates.removeFromParent();
    this.crates.dispose();
    this.crates = bigger;
  }
}

import {
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Uint32BufferAttribute,
  Vector3,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOCAL_MAX_ALT } from '../../shared/scale';
import { HEIGHT_MAX, type Terrain } from '../../shared/terrain';
import { angleBetween, type Vec3 } from '../../shared/vec3';
import type { WorldView } from '../../sim/views';
import { palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { DEFAULT_FILTER, type MapFilter } from './filters';
import { greatCircleArc, sectionFill } from './geometry';

// From orbit, borders and fills float just above the highest peak.
const ORBIT_LIFT = HEIGHT_MAX + 0.05;
const DRAPE_LIFT = 0.03;
const DRAPE_STEP = 0.2;
const NEAR_TARGET = 30;
const ARC_STEP = 0.02; // radians per segment for orbit borders

type Section = WorldView['sections'][number];

const UP = new Vector3(0, 1, 0);

/** Places one instance radially at dir, at radius r, scaled by s. */
function radial(dir: Vec3, r: number, s: number, out: Matrix4): Matrix4 {
  const d = new Vector3(...dir);
  return out.compose(
    d.clone().multiplyScalar(r),
    new Quaternion().setFromUnitVectors(UP, d),
    new Vector3(s, s, s),
  );
}

function lines(points: number[], color: string): LineSegments {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points, 3));
  return new LineSegments(g, new LineBasicMaterial({ color }));
}

/** Section borders, the ownership fill, deposit markers and contract pins. */
export class SectionOverlay {
  private readonly root = new Group();
  private readonly orbit = new Group();
  private borders: LineSegments | null = null;
  private buyable: LineSegments | null = null;
  private fill: Mesh | null = null;
  private markers: InstancedMesh | null = null;
  private pins: InstancedMesh | null = null;
  private draped: LineSegments | null = null;
  private drapedKey = '';
  private readonly drapeCache = new Map<number, number[]>();
  private reach = new Map<number, number>();
  private world: WorldView | null = null;
  private filter: MapFilter = DEFAULT_FILTER;

  constructor(
    parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
  ) {
    this.root.add(this.orbit);
    parent.add(this.root);
  }

  setWorld(w: WorldView): void {
    const first = !this.world;
    this.world = w;
    if (first) {
      this.borders = this.replace(
        this.borders,
        lines(this.arcs(w.sections, ORBIT_LIFT), palette.cream),
      );
      this.reach = new Map(
        w.sections.map((s) => [s.id, Math.max(...s.polygon.map((p) => angleBetween(s.center, p)))]),
      );
    }
    const buyable = w.sections.filter((s) => s.buyable);
    this.buyable = this.replace(
      this.buyable,
      lines(this.arcs(buyable, ORBIT_LIFT + 0.01), palette.mustard),
    );
    this.fill = this.replace(
      this.fill,
      this.ownedFill(w.sections.filter((s) => s.owner === 'player')),
    );
    this.pins = this.replace(this.pins, this.contractPins(w));
    this.markers = this.replace(this.markers, this.depositMarkers(w));
    this.applyFilter();
  }

  setFilter(f: MapFilter): void {
    this.filter = f;
    if (this.world) this.markers = this.replace(this.markers, this.depositMarkers(this.world));
    this.applyFilter();
  }

  update(view: GlobeCameraState): void {
    const fromOrbit = view.altitude >= LOCAL_MAX_ALT;
    this.orbit.visible = fromOrbit;
    if (this.draped) this.draped.visible = !fromOrbit;
    if (!fromOrbit && this.world) this.drape(view.pos);
  }

  dispose(): void {
    for (const o of [this.borders, this.buyable, this.fill, this.markers, this.pins, this.draped]) {
      if (o) this.release(o);
    }
    this.root.removeFromParent();
  }

  private applyFilter(): void {
    const p = this.filter.planetary;
    if (this.fill) this.fill.visible = p === 'ownership';
    if (this.buyable) this.buyable.visible = p === 'ownership';
    if (this.pins) this.pins.visible = p === 'contracts';
    if (this.markers) this.markers.visible = typeof p === 'object';
  }

  /** Swaps an orbit object, freeing the old one. */
  private replace<T extends Object3D>(old: T | null, next: T): T {
    if (old) this.release(old);
    this.orbit.add(next);
    return next;
  }

  private release(o: Object3D): void {
    o.removeFromParent();
    const m = o as Mesh;
    m.geometry.dispose();
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
  }

  /** Each border edge once, as arcs at radius + lift. */
  private arcs(sections: Section[], lift: number): number[] {
    const out: number[] = [];
    const seen = new Set<string>();
    const r = this.radius + lift;
    const key = (p: Vec3): string => p.map((x) => x.toFixed(6)).join(',');
    for (const s of sections) {
      s.polygon.forEach((a, i) => {
        const b = s.polygon[(i + 1) % s.polygon.length]!;
        const id = [key(a), key(b)].sort().join('|');
        if (seen.has(id)) return;
        seen.add(id);
        const arc = greatCircleArc(a, b, Math.max(2, Math.ceil(angleBetween(a, b) / ARC_STEP)));
        for (let k = 1; k < arc.length; k++) {
          out.push(...arc[k - 1]!.map((x) => x * r), ...arc[k]!.map((x) => x * r));
        }
      });
    }
    return out;
  }

  private ownedFill(owned: Section[]): Mesh {
    const r = this.radius + ORBIT_LIFT - 0.01;
    const positions: number[] = [];
    const indices: number[] = [];
    for (const s of owned) {
      const f = sectionFill(s.polygon, s.center, 6);
      const base = positions.length / 3;
      f.positions.forEach((x) => positions.push(x * r));
      f.indices.forEach((i) => indices.push(base + i));
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setIndex(new Uint32BufferAttribute(indices, 1));
    const material = new MeshBasicMaterial({
      color: palette.burntOrange,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: DoubleSide,
    });
    return new Mesh(g, material);
  }

  private depositMarkers(w: WorldView): InstancedMesh {
    const p = this.filter.planetary;
    const goodId = typeof p === 'object' ? p.resource : null;
    const deposits = w.plots.filter((x) => x.deposit && x.deposit.goodId === goodId);
    const mesh = new InstancedMesh(
      new SphereGeometry(1, 12, 8),
      new MeshBasicMaterial({ color: palette.burntOrange }),
      Math.max(1, deposits.length),
    );
    mesh.count = deposits.length;
    const m = new Matrix4();
    deposits.forEach((x, i) => {
      // Size grows with richness (0.6–1.6).
      mesh.setMatrixAt(
        i,
        radial(x.dir, this.radius + ORBIT_LIFT, 0.4 + 0.6 * x.deposit!.richness, m),
      );
    });
    return mesh;
  }

  private contractPins(w: WorldView): InstancedMesh {
    const plots = new Map(w.plots.map((p) => [p.id, p]));
    const sites = w.contractSites.map((c) => plots.get(c.plotId)).filter((p) => p !== undefined);
    // A pin: a cone standing on its tip with a ball on top.
    const cone = new ConeGeometry(0.35, 1.4, 12).rotateX(Math.PI).translate(0, 0.7, 0);
    const head = new SphereGeometry(0.45, 12, 8).translate(0, 1.5, 0);
    const pin = mergeGeometries([cone.toNonIndexed(), head.toNonIndexed()]);
    cone.dispose();
    head.dispose();
    const mesh = new InstancedMesh(
      pin,
      new MeshBasicMaterial({ color: palette.mustard }),
      Math.max(1, sites.length),
    );
    mesh.count = sites.length;
    const m = new Matrix4();
    sites.forEach((p, i) => mesh.setMatrixAt(i, radial(p.dir, this.radius + ORBIT_LIFT, 1.2, m)));
    return mesh;
  }

  /** Borders on the ground for sections near the camera target, built once per section. */
  private drape(target: Vec3): void {
    const w = this.world!;
    const near = w.sections.filter(
      (s) =>
        (angleBetween(s.center, target) - (this.reach.get(s.id) ?? 0)) * this.radius <= NEAR_TARGET,
    );
    const key = near.map((s) => s.id).join(',');
    if (key === this.drapedKey) return;
    this.drapedKey = key;
    const points: number[] = [];
    for (const s of near) {
      let cached = this.drapeCache.get(s.id);
      if (!cached) {
        cached = this.drapeSection(s);
        this.drapeCache.set(s.id, cached);
      }
      points.push(...cached);
    }
    if (this.draped) this.release(this.draped);
    this.draped = lines(points, palette.cream);
    this.root.add(this.draped);
  }

  private drapeSection(s: Section): number[] {
    const out: number[] = [];
    const at = (d: Vec3): number[] =>
      d.map((x) => x * (this.radius + this.terrain.height(d) + DRAPE_LIFT));
    s.polygon.forEach((a, i) => {
      const b = s.polygon[(i + 1) % s.polygon.length]!;
      const steps = Math.max(2, Math.ceil((angleBetween(a, b) * this.radius) / DRAPE_STEP));
      const arc = greatCircleArc(a, b, steps).map(at);
      for (let k = 1; k < arc.length; k++) out.push(...arc[k - 1]!, ...arc[k]!);
    });
    return out;
  }
}

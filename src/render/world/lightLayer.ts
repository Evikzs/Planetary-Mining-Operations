import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { Terrain } from '../../shared/terrain';
import {
  add,
  angleBetween,
  cross,
  normalize,
  scale,
  sub,
  tangentBasis,
  type Vec3,
} from '../../shared/vec3';
import type { WorldView } from '../../sim/views';
import { kit } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { farLightMaterial, poolMaterial } from '../materials';
import { kitMaterial, METRES_PER_UNIT, type SceneUniforms } from './kit';
import { visibleLayers } from './lod';
import { lampGeometry, levelHeight, type ModelKey } from './models';
import { plotYaw, standAt } from './placement';

// Night light, as in Fable's town: street lamps with pools of light under them, pools round the
// buildings, red beacons on tall structures, and from orbit a dot of light per building.

const M = 1 / METRES_PER_UNIT;
const LAMP_STEP = 36 * M;
const LAMP_SIDE = 5 * M;
const BEACON_PULSE = 2.4;

type Light = 'home' | 'work' | 'life' | 'cool';
const LIGHT: Partial<Record<ModelKey, Light>> = {
  crewQuarters: 'home',
  habitatDome: 'home',
  depot: 'work',
  regolithScoop: 'work',
  mine: 'work',
  iceDrill: 'cool',
  he3Harvester: 'work',
  smelter: 'work',
  waferFab: 'cool',
  chemicalRefinery: 'work',
  electrolysisPlant: 'cool',
  airPlant: 'life',
  waterPlant: 'life',
  hydroponicsFarm: 'life',
  assemblyWorks: 'work',
  warehouse: 'work',
  roverGarage: 'work',
  contractSite: 'work',
  'asset:landingPad': 'cool',
  'asset:commMast': 'cool',
  'asset:roadDepot': 'work',
};
/** Colour, pool radius in metres, pool strength, and the size of the dot seen from afar. */
const LOOK: Record<Light, { hex: string; r: number; k: number; dot: number }> = {
  home: { hex: kit.glowWindow[0], r: 18, k: 0.22, dot: 0.25 },
  work: { hex: kit.glowWork[0], r: 28, k: 0.24, dot: 0.35 },
  life: { hex: kit.glowLife[0], r: 24, k: 0.16, dot: 0.3 },
  cool: { hex: kit.glowCool[0], r: 32, k: 0.12, dot: 0.3 },
};
/** Red lights on tall structures, in model metres. */
const BEACONS: Partial<Record<ModelKey, [number, number, number][]>> = {
  mine: [[0, 39.4, 0]],
  iceDrill: [[0, 26.2, 0]],
  smelter: [
    [-9, 36.6, -4],
    [-3, 30.5, 4.5],
  ],
  chemicalRefinery: [[-8, 23.2, -4]],
  depot: [[8, 18.8, -4]],
  'asset:commMast': [[0, 48.6, 0]],
};

interface Placed {
  key: ModelKey;
  dir: Vec3;
  plotId: number;
  level: number;
}

export class LightLayer {
  private readonly lampGeometry = lampGeometry();
  private readonly lampMaterial: Material;
  private readonly poolGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly poolMat: Material;
  private readonly beaconGeometry = new SphereGeometry(0.55 * M, 8, 6);
  private readonly beaconMaterial = new MeshBasicMaterial({ color: '#ff3b2f' });
  private readonly farGeometry = new PlaneGeometry(1, 1);
  private readonly farMat: ReturnType<typeof farLightMaterial>;
  private lamps: InstancedMesh | null = null;
  private pools: InstancedMesh | null = null;
  private beacons: InstancedMesh | null = null;
  private far: InstancedMesh | null = null;
  private readonly m = new Matrix4();
  private readonly s = new Matrix4();
  private readonly c = new Color();

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    u: SceneUniforms,
    glow: Texture,
    private readonly reducedMotion: boolean,
  ) {
    this.lampMaterial = kitMaterial(u);
    this.poolMat = poolMaterial(u, glow);
    this.farMat = farLightMaterial(u, glow);
  }

  setWorld(w: WorldView): void {
    const plots = new Map(w.plots.map((p) => [p.id, p]));
    const placed: Placed[] = [];
    for (const b of w.buildings) {
      const p = plots.get(b.plotId);
      if (p && b.status !== 'constructing') {
        placed.push({ key: b.type, dir: p.dir, plotId: p.id, level: b.level });
      }
    }
    for (const a of w.clientAssets) {
      const p = plots.get(a.plotId);
      if (p)
        placed.push({ key: `asset:${a.asset}` as ModelKey, dir: p.dir, plotId: p.id, level: 1 });
    }
    const lamps = w.roads.flatMap((r) => this.lampsAlong(r.points));
    this.buildLamps(lamps);
    this.buildPools(lamps, placed);
    this.buildBeacons(placed);
    this.buildFar(placed);
  }

  update(view: GlobeCameraState): void {
    const layers = visibleLayers(view.altitude);
    if (this.lamps) this.lamps.visible = layers.buildings && view.altitude < 30;
    if (this.pools) this.pools.visible = layers.buildings && view.altitude < 30;
    if (this.beacons) {
      this.beacons.visible = layers.buildings;
      const t = this.reducedMotion ? 0.6 : performance.now() / 1000;
      const pulse = this.reducedMotion ? 0.6 : Math.pow(0.5 + 0.5 * Math.sin(t * BEACON_PULSE), 6);
      this.beaconMaterial.color.setRGB(2.4, 0.3, 0.22).multiplyScalar(0.15 + 0.85 * pulse);
    }
    const u = this.farMat.uniforms.uFar!;
    u.value = Math.min(1, Math.max(0, (view.altitude - 5) / 20));
    if (this.far) this.far.visible = u.value > 0.01;
  }

  dispose(): void {
    for (const mesh of [this.lamps, this.pools, this.beacons, this.far]) this.release(mesh);
    for (const g of [this.lampGeometry, this.poolGeometry, this.beaconGeometry, this.farGeometry])
      g.dispose();
    for (const m of [this.lampMaterial, this.poolMat, this.beaconMaterial, this.farMat])
      m.dispose();
  }

  private release(mesh: InstancedMesh | null): void {
    mesh?.removeFromParent();
    mesh?.dispose();
    // The far lights carry their own copy of the quad, with per-building colour and size.
    if (mesh && mesh === this.far) mesh.geometry.dispose();
  }

  private mesh(geometry: BufferGeometry, material: Material, count: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
    mesh.count = count;
    mesh.frustumCulled = false;
    this.parent.add(mesh);
    return mesh;
  }

  /** Lamps every 36 m, sides taking turns; each faces the road. */
  private lampsAlong(points: Vec3[]): { at: Vec3; toRoad: Vec3 }[] {
    const out: { at: Vec3; toRoad: Vec3 }[] = [];
    let next = LAMP_STEP / 2;
    let walked = 0;
    let k = 0;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1]!, points[i]!];
      const len = angleBetween(a, b) * this.radius;
      while (len > 0 && next <= walked + len) {
        const f = (next - walked) / len;
        const dir = normalize(add(a, scale(sub(b, a), f)));
        const side = scale(normalize(cross(normalize(sub(b, a)), dir)), k % 2 ? 1 : -1);
        out.push({
          at: normalize(add(dir, scale(side, LAMP_SIDE / this.radius))),
          toRoad: scale(side, -1),
        });
        next += LAMP_STEP;
        k++;
      }
      walked += len;
    }
    return out;
  }

  /** A matrix that stands an object at dir with its +z towards `facing`, scaled by s. */
  private stand(dir: Vec3, facing: Vec3, s: number, lift = 0): Matrix4 {
    const up = new Vector3(...dir);
    const z = new Vector3(...facing)
      .addScaledVector(up, -up.dot(new Vector3(...facing)))
      .normalize();
    const x = new Vector3().crossVectors(up, z);
    const r = this.radius + this.terrain.height(dir) + lift;
    return this.m
      .makeBasis(x, up, z)
      .scale(new Vector3(s, 1, s))
      .setPosition(up.multiplyScalar(r));
  }

  private buildLamps(lamps: { at: Vec3; toRoad: Vec3 }[]): void {
    this.release(this.lamps);
    this.lamps = this.mesh(this.lampGeometry, this.lampMaterial, lamps.length);
    lamps.forEach((l, i) => this.lamps!.setMatrixAt(i, this.stand(l.at, l.toRoad, 1)));
  }

  private buildPools(lamps: { at: Vec3; toRoad: Vec3 }[], placed: Placed[]): void {
    const pools: { dir: Vec3; r: number; hex: string; k: number }[] = lamps.map((l) => ({
      dir: normalize(add(l.at, scale(l.toRoad, (1.6 * M) / this.radius))),
      r: 16,
      hex: kit.glowWork[0],
      k: 0.3,
    }));
    for (const p of placed) {
      const light = LIGHT[p.key];
      if (light)
        pools.push({ dir: p.dir, r: LOOK[light].r, hex: LOOK[light].hex, k: LOOK[light].k });
    }
    this.release(this.pools);
    this.pools = this.mesh(this.poolGeometry, this.poolMat, pools.length);
    pools.forEach((p, i) => {
      this.pools!.setMatrixAt(
        i,
        this.stand(p.dir, tangentBasis(p.dir).east, p.r * 2 * M, 0.12 * M),
      );
      this.pools!.setColorAt(i, this.c.set(p.hex).multiplyScalar(p.k));
    });
    this.pools.renderOrder = 2;
  }

  private buildBeacons(placed: Placed[]): void {
    const spots: Matrix4[] = [];
    for (const p of placed) {
      const base = standAt(
        p.dir,
        this.radius,
        this.terrain,
        plotYaw(p.plotId),
        new Matrix4(),
        -0.01,
        levelHeight(p.level),
      );
      for (const [x, y, z] of BEACONS[p.key] ?? []) {
        spots.push(new Matrix4().makeTranslation(x * M, y * M, z * M).premultiply(base));
      }
    }
    this.release(this.beacons);
    this.beacons = this.mesh(this.beaconGeometry, this.beaconMaterial, spots.length);
    spots.forEach((m, i) => this.beacons!.setMatrixAt(i, m));
  }

  private buildFar(placed: Placed[]): void {
    const lit = placed.filter((p) => LIGHT[p.key]);
    this.release(this.far);
    const color = new Float32Array(Math.max(1, lit.length) * 3);
    const size = new Float32Array(Math.max(1, lit.length));
    lit.forEach((p, i) => {
      const look = LOOK[LIGHT[p.key]!];
      this.c
        .set(look.hex)
        .multiplyScalar(1.6)
        .toArray(color, i * 3);
      size[i] = look.dot;
    });
    const geometry = this.farGeometry.clone();
    geometry.setAttribute('aColor', new InstancedBufferAttribute(color, 3));
    geometry.setAttribute('aSize', new InstancedBufferAttribute(size, 1));
    this.far = this.mesh(geometry, this.farMat, lit.length);
    this.far.renderOrder = 3;
    lit.forEach((p, i) => {
      const r = this.radius + this.terrain.height(p.dir) + 20 * M;
      this.far!.setMatrixAt(i, this.s.makeTranslation(p.dir[0] * r, p.dir[1] * r, p.dir[2] * r));
    });
  }
}

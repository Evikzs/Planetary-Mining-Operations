import {
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Sprite,
  SpriteMaterial,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { BUILDINGS } from '../../data/buildings';
import type { Terrain } from '../../shared/terrain';
import type { Vec3 } from '../../shared/vec3';
import type { BuildingStatus } from '../../sim/state';
import type { UiSnapshot, WorldView } from '../../sim/views';
import { palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { DEFAULT_FILTER, filterTint, type MapFilter } from '../overlays/filters';
import { visibleLayers } from './lod';
import { buildModel, craneGeometry, levelHeight, scaffoldGeometry, type ModelKey } from './models';
import { plotYaw, standAt } from './placement';

type Stamp = 'unpowered' | 'unstaffed' | 'blocked' | 'striking';
const STAMPED = new Set<BuildingStatus>(['unpowered', 'unstaffed', 'blocked', 'striking']);
const CRANE_RADIANS_PER_MS = (20 * Math.PI) / 180 / 1000;
const STAMP_SIZE = 0.22;
const WHITE = new Color(1, 1, 1);

interface Placed {
  key: ModelKey;
  dir: Vec3;
  plotId: number;
  level: number;
  /** null for client assets and contract sites. */
  buildingId: number | null;
  status: BuildingStatus;
  progress: number;
}

/** A round badge with a simple glyph, drawn once per stamp. */
function stampTexture(stamp: Stamp): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = stamp === 'striking' ? palette.rust : palette.mustard;
  g.strokeStyle = palette.offBlack;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = palette.offBlack;
  g.beginPath();
  if (stamp === 'unpowered') {
    for (const [x, y] of [
      [36, 10],
      [20, 36],
      [31, 36],
      [27, 54],
      [44, 27],
      [33, 27],
    ])
      g.lineTo(x!, y!);
  } else if (stamp === 'unstaffed') {
    g.arc(32, 23, 8, 0, Math.PI * 2);
    g.moveTo(16, 50);
    g.arc(32, 50, 16, Math.PI, 0);
  } else if (stamp === 'blocked') {
    g.rect(16, 28, 32, 8);
  } else {
    g.rect(22, 14, 22, 16);
    g.rect(30, 30, 5, 22);
  }
  g.fill();
  return new CanvasTexture(c);
}

/** Building models, construction scaffolds with turning cranes, and status badges. */
export class BuildingLayer {
  private readonly group = new Group();
  private readonly material: MeshToonMaterial;
  private readonly geometries = new Map<ModelKey, BufferGeometry>();
  private readonly heights = new Map<ModelKey, number>();
  private readonly meshes = new Map<ModelKey, InstancedMesh>();
  private scaffolds: InstancedMesh | null = null;
  private cranes: InstancedMesh | null = null;
  private placed: Placed[] = [];
  private sites: Placed[] = [];
  private readonly stamps = new Map<number, Sprite>();
  private readonly stampMaterials = new Map<Stamp, SpriteMaterial>();
  private readonly scaffoldGeometry = scaffoldGeometry();
  private readonly craneGeometry = craneGeometry();
  private ui: Map<number, UiSnapshot['buildings'][number]> = new Map();
  private filter: MapFilter = DEFAULT_FILTER;
  private readonly m = new Matrix4();
  private readonly tint = new Color();

  constructor(
    parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    gradientMap: Texture,
    private readonly reducedMotion: boolean,
  ) {
    this.material = new MeshToonMaterial({ vertexColors: true, gradientMap });
    parent.add(this.group);
  }

  setWorld(w: WorldView): void {
    const plots = new Map(w.plots.map((p) => [p.id, p]));
    const at = (plotId: number) => plots.get(plotId)?.dir;
    this.placed = [];
    for (const b of w.buildings) {
      const dir = at(b.plotId);
      if (!dir) continue;
      this.placed.push({
        key: b.type,
        dir,
        plotId: b.plotId,
        level: b.level,
        buildingId: b.id,
        status: b.status,
        progress: b.progress,
      });
    }
    for (const a of w.clientAssets) {
      const dir = at(a.plotId);
      if (dir)
        this.placed.push({
          key: `asset:${a.asset}` as ModelKey,
          dir,
          plotId: a.plotId,
          level: 1,
          buildingId: null,
          status: 'active',
          progress: 1,
        });
    }
    for (const c of w.contractSites) {
      const dir = at(c.plotId);
      if (dir)
        this.placed.push({
          key: 'contractSite',
          dir,
          plotId: c.plotId,
          level: 1,
          buildingId: null,
          status: 'active',
          progress: 1,
        });
    }
    this.rebuildModels();
    this.refresh();
  }

  setUi(ui: UiSnapshot): void {
    this.ui = new Map(ui.buildings.map((b) => [b.id, b]));
    this.refresh();
  }

  setFilter(f: MapFilter): void {
    this.filter = f;
    this.applyTints();
  }

  update(view: GlobeCameraState): void {
    this.group.visible = visibleLayers(view.altitude).buildings;
    if (this.group.visible && !this.reducedMotion) this.placeCranes();
  }

  /** Cranes turn at 20°/s of real time; with reduced motion they stand still. */
  private placeCranes(): void {
    if (!this.cranes) return;
    const turn = this.reducedMotion ? 0 : performance.now() * CRANE_RADIANS_PER_MS;
    this.sites.forEach((p, i) => {
      this.cranes!.setMatrixAt(
        i,
        standAt(p.dir, this.radius, this.terrain, plotYaw(p.plotId) + turn, this.m),
      );
    });
    this.cranes.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.clearMeshes();
    for (const g of this.geometries.values()) g.dispose();
    this.scaffoldGeometry.dispose();
    this.craneGeometry.dispose();
    for (const s of this.stamps.values()) s.removeFromParent();
    for (const m of this.stampMaterials.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.material.dispose();
    this.group.removeFromParent();
  }

  private status(p: Placed): { status: BuildingStatus; progress: number } {
    const live = p.buildingId === null ? undefined : this.ui.get(p.buildingId);
    return live ? { status: live.status, progress: live.progress } : p;
  }

  private geometry(key: ModelKey): BufferGeometry {
    let g = this.geometries.get(key);
    if (!g) {
      g = buildModel(key, 1);
      g.computeBoundingBox();
      this.heights.set(key, g.boundingBox!.max.y);
      this.geometries.set(key, g);
    }
    return g;
  }

  private clearMeshes(): void {
    for (const mesh of [...this.meshes.values(), this.scaffolds, this.cranes]) {
      mesh?.removeFromParent();
      mesh?.dispose();
    }
    this.meshes.clear();
    this.scaffolds = null;
    this.cranes = null;
  }

  /** One instanced mesh per model; buildings under construction show only their scaffold. */
  private rebuildModels(): void {
    this.clearMeshes();
    const byKey = new Map<ModelKey, Placed[]>();
    for (const p of this.placed) {
      if (p.status === 'constructing') continue;
      byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
    }
    for (const [key, list] of byKey) {
      const mesh = new InstancedMesh(this.geometry(key), this.material, list.length);
      list.forEach((p, i) => {
        mesh.setMatrixAt(
          i,
          standAt(
            p.dir,
            this.radius,
            this.terrain,
            plotYaw(p.plotId),
            this.m,
            -0.01,
            levelHeight(p.level),
          ),
        );
        mesh.setColorAt(i, WHITE);
      });
      mesh.userData.placed = list;
      this.meshes.set(key, mesh);
      this.group.add(mesh);
    }
    this.sites = this.placed.filter((p) => p.status === 'constructing' || p.status === 'upgrading');
    if (this.sites.length > 0) {
      this.scaffolds = new InstancedMesh(this.scaffoldGeometry, this.material, this.sites.length);
      this.cranes = new InstancedMesh(this.craneGeometry, this.material, this.sites.length);
      this.group.add(this.scaffolds, this.cranes);
      this.placeCranes();
    }
  }

  /** Scaffold heights follow progress; badges follow status; tints follow the filter. */
  private refresh(): void {
    this.sites.forEach((p, i) => {
      const h = Math.max(0.05, this.status(p).progress);
      this.scaffolds!.setMatrixAt(
        i,
        standAt(p.dir, this.radius, this.terrain, plotYaw(p.plotId), this.m, -0.01, h),
      );
    });
    if (this.scaffolds) this.scaffolds.instanceMatrix.needsUpdate = true;
    this.refreshStamps();
    this.applyTints();
  }

  private refreshStamps(): void {
    const wanted = new Map<number, { p: Placed; stamp: Stamp }>();
    for (const p of this.placed) {
      const { status } = this.status(p);
      if (p.buildingId !== null && STAMPED.has(status))
        wanted.set(p.buildingId, { p, stamp: status as Stamp });
    }
    for (const [id, sprite] of this.stamps) {
      if (wanted.get(id)?.stamp !== sprite.userData.stamp) {
        sprite.removeFromParent();
        this.stamps.delete(id);
      }
    }
    for (const [id, { p, stamp }] of wanted) {
      if (this.stamps.has(id)) continue;
      let material = this.stampMaterials.get(stamp);
      if (!material) {
        material = new SpriteMaterial({ map: stampTexture(stamp) });
        this.stampMaterials.set(stamp, material);
      }
      const sprite = new Sprite(material);
      sprite.userData.stamp = stamp;
      const lift = (this.heights.get(p.key) ?? 0.3) * levelHeight(p.level) + 0.2;
      const r = this.radius + this.terrain.height(p.dir) + lift;
      sprite.position.set(p.dir[0] * r, p.dir[1] * r, p.dir[2] * r);
      sprite.scale.setScalar(STAMP_SIZE);
      this.stamps.set(id, sprite);
      this.group.add(sprite);
    }
  }

  private applyTints(): void {
    const local = this.filter.local;
    for (const mesh of this.meshes.values()) {
      const list = mesh.userData.placed as Placed[];
      list.forEach((p, i) => {
        const live = p.buildingId === null ? undefined : this.ui.get(p.buildingId);
        let color = WHITE;
        if (live && local === 'power') color = this.tint.set(filterTint(live.powerFactor, 1, 0.5));
        else if (live && local === 'morale' && BUILDINGS[live.type].housing) {
          color = this.tint.set(filterTint(live.avgMorale / 100, 0.5, 0.25));
        }
        mesh.setColorAt(i, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

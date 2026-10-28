import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
  type Object3D,
} from 'three';
import type { Terrain } from '../../shared/terrain';
import type { WorldView } from '../../sim/views';
import { palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { visibleLayers } from './lod';
import { standAt } from './placement';

const RING_COLOR = { build: palette.cream, deposit: palette.burntOrange, public: palette.mustard };

/** Rings on free plots: cream to build on, burnt orange on deposits, mustard on public plots. */
export class PlotLayer {
  private readonly geometry = new RingGeometry(0.32, 0.4, 32).rotateX(-Math.PI / 2);
  private readonly material = new MeshBasicMaterial();
  private mesh: InstancedMesh | null = null;

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
  ) {}

  setWorld(w: WorldView): void {
    const taken = new Set([
      ...w.buildings.map((b) => b.plotId),
      ...w.clientAssets.map((a) => a.plotId),
      ...w.contractSites.map((c) => c.plotId),
    ]);
    const free = w.plots.filter((p) => p.kind !== 'hub' && !taken.has(p.id));
    this.mesh?.removeFromParent();
    this.mesh?.dispose();
    this.mesh = new InstancedMesh(this.geometry, this.material, Math.max(1, free.length));
    this.mesh.count = free.length;
    const m = new Matrix4();
    const c = new Color();
    free.forEach((p, i) => {
      this.mesh!.setMatrixAt(i, standAt(p.dir, this.radius, this.terrain, 0, m, 0.06));
      this.mesh!.setColorAt(i, c.set(RING_COLOR[p.kind as keyof typeof RING_COLOR]));
    });
    this.parent.add(this.mesh);
  }

  update(view: GlobeCameraState): void {
    if (this.mesh) this.mesh.visible = visibleLayers(view.altitude).plotMarkers;
  }

  dispose(): void {
    this.mesh?.removeFromParent();
    this.mesh?.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

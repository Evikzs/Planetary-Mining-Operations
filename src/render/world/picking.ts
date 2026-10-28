import { InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry, type Raycaster } from 'three';
import type { Terrain } from '../../shared/terrain';
import type { WorldView } from '../../sim/views';
import type { MapPick } from '../renderer';
import { MODEL_FOOTPRINT } from './models';
import { standAt } from './placement';

/** Invisible spheres over every plot; a hit on a built plot picks its building. */
export class PlotPicker {
  private readonly geometry = new SphereGeometry(MODEL_FOOTPRINT, 8, 6);
  private readonly material = new MeshBasicMaterial({ visible: false });
  private mesh: InstancedMesh | null = null;
  private plotIds: number[] = [];
  private buildingOn = new Map<number, number>();

  constructor(
    private readonly terrain: Terrain,
    private readonly radius: number,
  ) {}

  setWorld(w: WorldView): void {
    this.mesh?.dispose();
    this.plotIds = w.plots.map((p) => p.id);
    this.buildingOn = new Map(w.buildings.map((b) => [b.plotId, b.id]));
    this.mesh = new InstancedMesh(this.geometry, this.material, w.plots.length);
    const m = new Matrix4();
    w.plots.forEach((p, i) =>
      this.mesh!.setMatrixAt(i, standAt(p.dir, this.radius, this.terrain, 0, m, 0.2)),
    );
    this.mesh.updateMatrixWorld();
  }

  pick(raycaster: Raycaster): MapPick | null {
    if (!this.mesh) return null;
    const hit = raycaster.intersectObject(this.mesh)[0];
    if (hit?.instanceId === undefined) return null;
    const plotId = this.plotIds[hit.instanceId]!;
    const buildingId = this.buildingOn.get(plotId);
    return buildingId === undefined
      ? { kind: 'plot', id: plotId }
      : { kind: 'building', id: buildingId };
  }

  dispose(): void {
    this.mesh?.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Uint32BufferAttribute,
  type Object3D,
} from 'three';
import type { Terrain } from '../../shared/terrain';
import type { Trip } from '../../shared/trips';
import { scale, type Vec3 } from '../../shared/vec3';
import type { WorldView } from '../../sim/views';
import { palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { visibleLayers } from './lod';
import { ribbonGeometry } from './ribbon';

const LIFT = 0.15;
const HOUR = 60;

/** Line width for a section's roads: wider the more buses left in the last game hour. */
export const trafficWidth = (trips: number): number => Math.min(0.8, 0.15 + 0.05 * trips);

/** From orbit, roads as mustard lines that swell with rush hour. */
export class TrafficLayer {
  private readonly material = new MeshBasicMaterial({
    color: palette.mustard,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  private roads: WorldView['roads'] = [];
  private mesh: Mesh | null = null;
  private key = '';

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
  ) {}

  setWorld(w: WorldView): void {
    this.roads = w.roads;
    this.key = '';
  }

  setTrips(trips: Trip[], tick: number): void {
    const count = new Map<number, number>();
    for (const t of trips) {
      if (t.departTick >= tick - HOUR) count.set(t.sectionId, (count.get(t.sectionId) ?? 0) + 1);
    }
    const key = `${this.roads.length}|${[...count].sort((a, b) => a[0] - b[0]).join(';')}`;
    if (key === this.key) return;
    this.key = key;
    this.rebuild(count);
  }

  update(view: GlobeCameraState): void {
    if (this.mesh) this.mesh.visible = visibleLayers(view.altitude).traffic;
  }

  dispose(): void {
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.material.dispose();
  }

  private rebuild(count: Map<number, number>): void {
    const parts = this.roads
      .filter((r) => r.points.length > 1)
      .map((r) => {
        const at = (d: Vec3): Vec3 => scale(d, this.radius + this.terrain.height(d) + LIFT);
        return ribbonGeometry(
          r.points.map(at),
          r.points,
          trafficWidth(count.get(r.sectionId) ?? 0),
        );
      });
    const positions = new Float32Array(parts.reduce((n, r) => n + r.positions.length, 0));
    const indices = new Uint32Array(parts.reduce((n, r) => n + r.indices.length, 0));
    let [v, i] = [0, 0];
    for (const r of parts) {
      positions.set(r.positions, v * 3);
      indices.set(
        r.indices.map((x) => x + v),
        i,
      );
      v += r.positions.length / 3;
      i += r.indices.length;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setIndex(new Uint32BufferAttribute(indices, 1));
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh = new Mesh(g, this.material);
    this.parent.add(this.mesh);
  }
}

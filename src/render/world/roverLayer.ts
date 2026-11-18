import {
  Color,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { Terrain } from '../../shared/terrain';
import { pointAt, tripState, type Trip } from '../../shared/trips';
import type { GlobeCameraState } from '../camera/globeCamera';
import { poolMaterial } from '../materials';
import { kitMaterial, METRES_PER_UNIT, type SceneUniforms } from './kit';
import { visibleLayers } from './lod';
import { busGeometry } from './models';

const M = 1 / METRES_PER_UNIT;
const HEADLIGHT = new Color('#fff1cf').multiplyScalar(0.16);

/** Buses on their trips, placed from the trip plan at the current game time, lights on at night. */
export class RoverLayer {
  private readonly geometry = busGeometry();
  private readonly material: Material;
  private readonly poolGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly poolMat: Material;
  private mesh: InstancedMesh;
  private pools: InstancedMesh;
  private trips: Trip[] = [];
  private readonly m = new Matrix4();
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly side = new Vector3();
  private readonly ahead = new Vector3();
  private readonly size = new Vector3(8 * M, 1, 17 * M);
  /** The trip and world position of each bus drawn last frame, by instance. */
  private readonly drawn: { tripId: number; at: Vector3 }[] = [];
  shown = 0;

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    u: SceneUniforms,
    glow: Texture,
  ) {
    this.material = kitMaterial(u);
    this.poolMat = poolMaterial(u, glow);
    [this.mesh, this.pools] = this.make(32);
  }

  setTrips(trips: Trip[]): void {
    this.trips = trips;
    if (trips.length > this.mesh.instanceMatrix.count) {
      for (const m of [this.mesh, this.pools]) {
        m.removeFromParent();
        m.dispose();
      }
      [this.mesh, this.pools] = this.make(trips.length * 2);
    }
  }

  update(gameTime: number, view: GlobeCameraState): void {
    const on = visibleLayers(view.altitude).rovers;
    this.mesh.visible = this.pools.visible = on;
    let k = 0;
    if (on) {
      for (const trip of this.trips) {
        const at = tripState(trip, gameTime);
        if (!at) continue;
        const { pos, tangent } = pointAt(trip.points, trip.cum, at.s);
        const r = this.radius + this.terrain.height(pos) + 0.02;
        this.fwd.set(...tangent);
        this.up.set(...pos);
        this.side.crossVectors(this.fwd, this.up);
        this.fwd.crossVectors(this.up, this.side).normalize();
        this.side.normalize();
        const bus = (this.drawn[k] ??= { tripId: 0, at: new Vector3() });
        bus.tripId = trip.id;
        bus.at.set(pos[0] * r, pos[1] * r, pos[2] * r);
        this.m.makeBasis(this.fwd, this.up, this.side).setPosition(bus.at);
        this.mesh.setMatrixAt(k, this.m);
        // A pool of headlight on the road ahead: the pool's long side runs along the bus.
        this.ahead
          .copy(bus.at)
          .addScaledVector(this.fwd, 11 * M)
          .addScaledVector(this.up, 0.12 * M);
        this.m.makeBasis(this.side, this.up, this.fwd).scale(this.size).setPosition(this.ahead);
        this.pools.setMatrixAt(k, this.m);
        this.pools.setColorAt(k, HEADLIGHT);
        k++;
      }
    }
    this.mesh.count = this.pools.count = k;
    this.mesh.instanceMatrix.needsUpdate = this.pools.instanceMatrix.needsUpdate = true;
    if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
    this.shown = k;
  }

  /** Where the bus of a trip was drawn last frame; null when it is not on the road or not shown. */
  positionOf(tripId: number): Vector3 | null {
    for (let k = 0; k < this.shown; k++)
      if (this.drawn[k]!.tripId === tripId) return this.drawn[k]!.at;
    return null;
  }

  /** The trip of the drawn bus nearest a click, when one lies within reach. */
  nearest(distance: (at: Vector3) => number, within: number): number | null {
    let best: number | null = null;
    let reach = within;
    for (let k = 0; k < this.shown; k++) {
      const bus = this.drawn[k]!;
      const d = distance(bus.at);
      if (d < reach) {
        reach = d;
        best = bus.tripId;
      }
    }
    return best;
  }

  dispose(): void {
    for (const m of [this.mesh, this.pools]) {
      m.removeFromParent();
      m.dispose();
    }
    this.geometry.dispose();
    this.poolGeometry.dispose();
    this.material.dispose();
    this.poolMat.dispose();
  }

  private make(capacity: number): [InstancedMesh, InstancedMesh] {
    const mesh = new InstancedMesh(this.geometry, this.material, capacity);
    const pools = new InstancedMesh(this.poolGeometry, this.poolMat, capacity);
    for (const m of [mesh, pools]) {
      m.count = 0;
      m.frustumCulled = false;
      this.parent.add(m);
    }
    mesh.castShadow = true;
    pools.renderOrder = 2;
    return [mesh, pools];
  }
}

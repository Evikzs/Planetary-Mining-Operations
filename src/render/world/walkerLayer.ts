import {
  CapsuleGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import { LUNA_RADIUS, WALK_SPEED } from '../../shared/scale';
import type { Terrain } from '../../shared/terrain';
import { pointAt, stopTimes, type Trip } from '../../shared/trips';
import { add, angleBetween, normalize, scale, sub, type Vec3 } from '../../shared/vec3';
import { palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { visibleLayers } from './lod';

export const MAX_WALKERS = 400;
const SKILL_COLOR = [palette.rust, palette.teal, palette.navy]; // miner, technician, engineer
const RADIUS = 0.03;
const HEIGHT = 0.08;

/**
 * Riders who got off at a stop, walking to the stop's building at WALK_SPEED.
 * Positions are unit directions; nobody shows before the bus arrives or after reaching the door.
 */
export function walkerPositions(
  trip: Trip,
  gameTime: number,
  doors: Map<number, Vec3>,
): { pos: Vec3; skill: number }[] {
  const out: { pos: Vec3; skill: number }[] = [];
  stopTimes(trip).forEach((arrive, k) => {
    const stop = trip.stops[k]!;
    const door = doors.get(stop.buildingId);
    if (!door || gameTime < arrive) return;
    const from = pointAt(trip.points, trip.cum, stop.s).pos;
    const walk = (angleBetween(from, door) * LUNA_RADIUS) / WALK_SPEED;
    const f = walk > 0 ? (gameTime - arrive) / walk : 1;
    if (f >= 1) return;
    const pos = normalize(add(from, scale(sub(door, from), f)));
    stop.workerIds.forEach((_, i) => out.push({ pos, skill: stop.skills?.[i] ?? 0 }));
  });
  return out;
}

/** Workers walking from the bus to the door, up close only. */
export class WalkerLayer {
  private readonly geometry = new CapsuleGeometry(RADIUS, HEIGHT - 2 * RADIUS, 2, 6).translate(
    0,
    HEIGHT / 2,
    0,
  );
  private readonly material: MeshToonMaterial;
  private readonly mesh: InstancedMesh;
  private doors = new Map<number, Vec3>();
  private trips: Trip[] = [];
  private readonly m = new Matrix4();
  private readonly color = new Color();
  shown = 0;

  constructor(
    parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    gradientMap: Texture,
  ) {
    this.material = new MeshToonMaterial({ gradientMap });
    this.mesh = new InstancedMesh(this.geometry, this.material, MAX_WALKERS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  setDoors(doors: Map<number, Vec3>): void {
    this.doors = doors;
  }

  setTrips(trips: Trip[]): void {
    this.trips = trips;
  }

  update(gameTime: number, view: GlobeCameraState): void {
    const on = visibleLayers(view.altitude).walkers;
    this.mesh.visible = on;
    if (!on) {
      this.shown = 0;
      return;
    }
    // Nearest first, so the cap drops far walkers. Each walker keeps a small sideways step,
    // seeded by trip and place in the group, so a group does not stand in one spot.
    const walkers = this.trips
      .flatMap((t) =>
        walkerPositions(t, gameTime, this.doors).map((w, j) => ({
          ...w,
          step: (((t.id * 31 + j) * 2654435761) % 1000) / 1000 - 0.5,
        })),
      )
      .sort((a, b) => angleBetween(a.pos, view.pos) - angleBetween(b.pos, view.pos))
      .slice(0, MAX_WALKERS);
    const up = new Vector3(0, 1, 0);
    walkers.forEach((w, i) => {
      const r = this.radius + this.terrain.height(w.pos);
      const d = new Vector3(...w.pos);
      const aside = new Vector3(w.step, -w.step, w.step).cross(d).multiplyScalar(0.08);
      this.m.compose(
        d.clone().multiplyScalar(r).add(aside),
        new Quaternion().setFromUnitVectors(up, d),
        new Vector3(1, 1, 1),
      );
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.color.set(SKILL_COLOR[w.skill] ?? palette.offBlack));
    });
    this.mesh.count = walkers.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.shown = walkers.length;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

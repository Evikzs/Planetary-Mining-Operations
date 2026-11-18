import {
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Vector3,
  Color,
  type Material,
  type Object3D,
} from 'three';
import { LUNA_RADIUS, WALK_SPEED } from '../../shared/scale';
import type { Terrain } from '../../shared/terrain';
import { pointAt, stopTimes, type Trip } from '../../shared/trips';
import { add, angleBetween, normalize, scale, sub, type Vec3 } from '../../shared/vec3';
import type { GlobeCameraState } from '../camera/globeCamera';
import { kitMaterial, type SceneUniforms } from './kit';
import { visibleLayers } from './lod';
import { SUIT_COLORS, walkerGeometry } from './models';

export const MAX_WALKERS = 400;

/**
 * Riders who got off at a stop, walking to the stop's building at WALK_SPEED.
 * Positions are unit directions; nobody shows before the bus arrives or after reaching the door.
 * `door` is where each one is going.
 */
export function walkerPositions(
  trip: Trip,
  gameTime: number,
  doors: Map<number, Vec3>,
): { pos: Vec3; skill: number; door: Vec3 }[] {
  const out: { pos: Vec3; skill: number; door: Vec3 }[] = [];
  stopTimes(trip).forEach((arrive, k) => {
    const stop = trip.stops[k]!;
    const door = doors.get(stop.buildingId);
    if (!door || gameTime < arrive) return;
    const from = pointAt(trip.points, trip.cum, stop.s).pos;
    const walk = (angleBetween(from, door) * LUNA_RADIUS) / WALK_SPEED;
    const f = walk > 0 ? (gameTime - arrive) / walk : 1;
    if (f >= 1) return;
    const pos = normalize(add(from, scale(sub(door, from), f)));
    stop.workerIds.forEach((_, i) => out.push({ pos, skill: stop.skills?.[i] ?? 0, door }));
  });
  return out;
}

/** Workers walking from the bus to the door, up close only: Fable's walkers, arms and legs swinging. */
export class WalkerLayer {
  private readonly geometry = walkerGeometry();
  private readonly tint = new InstancedBufferAttribute(new Float32Array(MAX_WALKERS * 3), 3);
  private readonly material: Material;
  private readonly mesh: InstancedMesh;
  private doors = new Map<number, Vec3>();
  private trips: Trip[] = [];
  private readonly m = new Matrix4();
  private readonly color = new Color();
  private readonly up = new Vector3();
  private readonly fwd = new Vector3();
  private readonly side = new Vector3();
  private readonly at = new Vector3();
  shown = 0;

  constructor(
    parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    u: SceneUniforms,
    reducedMotion: boolean,
  ) {
    this.geometry.setAttribute('iTint', this.tint);
    // The suit takes the walker's colour; arms and legs swing about their pivots as they walk.
    this.material = kitMaterial(u, (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float tintMask; attribute vec2 limb; attribute vec3 iTint;',
        )
        .replace(
          '#include <color_vertex>',
          '#include <color_vertex>\nvColor.rgb *= mix(vec3(1.), iTint, tintMask);',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed.z += ${reducedMotion ? '0.' : '1.'} * limb.x * sin(uTime * 7.5 + float(gl_InstanceID) * 1.7) * (limb.y * ${(1 / 40).toFixed(4)} - position.y) * .55;`,
        );
    });
    this.mesh = new InstancedMesh(this.geometry, this.material, MAX_WALKERS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
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
    walkers.forEach((w, i) => {
      const r = this.radius + this.terrain.height(w.pos);
      this.up.set(...w.pos);
      this.fwd.set(...sub(w.door, w.pos));
      this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up)).normalize();
      this.side.crossVectors(this.up, this.fwd);
      this.at
        .copy(this.up)
        .multiplyScalar(r)
        .addScaledVector(this.side, w.step * 0.06);
      this.m.makeBasis(this.side, this.up, this.fwd).setPosition(this.at);
      this.mesh.setMatrixAt(i, this.m);
      this.color.set(SUIT_COLORS[w.skill] ?? SUIT_COLORS[0]).toArray(this.tint.array, i * 3);
    });
    this.mesh.count = walkers.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.shown = walkers.length;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

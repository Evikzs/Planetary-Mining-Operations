import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Terrain } from '../../shared/terrain';
import { pointAt, tripState, type Trip } from '../../shared/trips';
import { palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { visibleLayers } from './lod';

const LENGTH = 0.22;

/** A flat-coloured part for the bus model. */
function colored(g: BufferGeometry, color: string): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  flat.deleteAttribute('uv');
  const c = new Color(color);
  const n = flat.getAttribute('position').count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.set([c.r, c.g, c.b], i * 3);
  flat.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  return flat;
}

/** The commuter bus: a mustard body with a teal stripe on six wheels, nose along +x. */
export function busGeometry(): BufferGeometry {
  const wheels = [-0.075, 0, 0.075].flatMap((x) =>
    [-0.05, 0.05].map((z) =>
      colored(
        new CylinderGeometry(0.022, 0.022, 0.02, 8).rotateX(Math.PI / 2).translate(x, 0.022, z),
        palette.offBlack,
      ),
    ),
  );
  return mergeGeometries([
    colored(new BoxGeometry(LENGTH, 0.07, 0.1).translate(0, 0.065, 0), palette.mustard),
    colored(new BoxGeometry(LENGTH + 0.002, 0.015, 0.102).translate(0, 0.075, 0), palette.teal),
    ...wheels,
  ]);
}

/** Buses on their trips, placed from the trip plan at the current game time. */
export class RoverLayer {
  private readonly geometry = busGeometry();
  private readonly material: MeshToonMaterial;
  private mesh: InstancedMesh;
  private trips: Trip[] = [];
  private readonly m = new Matrix4();
  private readonly fwd = new Vector3();
  private readonly up = new Vector3();
  private readonly side = new Vector3();
  shown = 0;

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    gradientMap: Texture,
  ) {
    this.material = new MeshToonMaterial({ vertexColors: true, gradientMap });
    this.mesh = this.make(32);
  }

  setTrips(trips: Trip[]): void {
    this.trips = trips;
    if (trips.length > this.mesh.instanceMatrix.count) {
      this.mesh.removeFromParent();
      this.mesh.dispose();
      this.mesh = this.make(trips.length * 2);
    }
  }

  update(gameTime: number, view: GlobeCameraState): void {
    const on = visibleLayers(view.altitude).rovers;
    this.mesh.visible = on;
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
        this.m
          .makeBasis(this.fwd, this.up, this.side)
          .setPosition(pos[0] * r, pos[1] * r, pos[2] * r);
        this.mesh.setMatrixAt(k++, this.m);
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shown = k;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private make(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.parent.add(mesh);
    return mesh;
  }
}

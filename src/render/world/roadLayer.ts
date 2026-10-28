import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshToonMaterial,
  Uint32BufferAttribute,
  type Object3D,
  type Texture,
} from 'three';
import type { Terrain } from '../../shared/terrain';
import { normalize, scale, type Vec3 } from '../../shared/vec3';
import type { WorldView } from '../../sim/views';
import { bodyAccent, mix, palette } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { visibleLayers } from './lod';
import { ribbonGeometry } from './ribbon';

const WIDTH = 0.18;
const LIFT = 0.02;

/** Roads as ribbons draped over the ground; from altitude 30 the traffic lines take over. */
export class RoadLayer {
  private readonly material: MeshToonMaterial;
  private readonly built = new Map<number, ReturnType<typeof ribbonGeometry>>();
  private mesh: Mesh | null = null;

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    gradientMap: Texture,
  ) {
    this.material = new MeshToonMaterial({
      color: mix(bodyAccent.luna, palette.offBlack, 0.35),
      gradientMap,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  setWorld(w: WorldView): void {
    const parts = w.roads.map((road) => {
      let r = this.built.get(road.id);
      if (!r) {
        r = this.ribbon(road.points);
        this.built.set(road.id, r);
      }
      return r;
    });
    const positions = new Float32Array(parts.reduce((n, r) => n + r.positions.length, 0));
    const normals = new Float32Array(positions.length);
    const indices = new Uint32Array(parts.reduce((n, r) => n + r.indices.length, 0));
    let [v, i] = [0, 0];
    for (const r of parts) {
      positions.set(r.positions, v * 3);
      normals.set(r.normals, v * 3);
      indices.set(
        r.indices.map((x) => x + v),
        i,
      );
      v += r.positions.length / 3;
      i += r.indices.length;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    g.setIndex(new Uint32BufferAttribute(indices, 1));
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh = new Mesh(g, this.material);
    this.parent.add(this.mesh);
  }

  update(view: GlobeCameraState): void {
    if (this.mesh) this.mesh.visible = !visibleLayers(view.altitude).traffic;
  }

  dispose(): void {
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.material.dispose();
  }

  /** A road's strip, each edge vertex set on the ground beneath it. */
  private ribbon(dirs: Vec3[]): ReturnType<typeof ribbonGeometry> {
    const at = (d: Vec3): Vec3 => scale(d, this.radius + this.terrain.height(d) + LIFT);
    const r = ribbonGeometry(dirs.map(at), dirs, WIDTH);
    for (let k = 0; k < r.positions.length; k += 3) {
      const d = normalize([r.positions[k]!, r.positions[k + 1]!, r.positions[k + 2]!]);
      r.positions.set(at(d), k);
    }
    return r;
  }
}

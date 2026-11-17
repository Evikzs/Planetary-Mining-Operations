import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MINERALS } from '../../data/minerals';
import type { Terrain } from '../../shared/terrain';
import { createRng, deriveSeed } from '../../sim/rng';
import type { WorldView } from '../../sim/views';
import { ink } from '../../ui/tokens';
import type { GlobeCameraState } from '../camera/globeCamera';
import { kitMaterial, METRES_PER_UNIT, type SceneUniforms } from './kit';
import { visibleLayers } from './lod';
import { crystalGeometry } from './models';
import { plotYaw, standAt } from './placement';

const M = 1 / METRES_PER_UNIT;
const MARK = { build: ink.brass, public: ink.lamp } as const;

/** Survey marks: an L of paint at each corner of a 28 m square, flat on the ground. */
function cornerMarks(): BufferGeometry {
  const e = 14;
  const arm = 5;
  const parts: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        new BoxGeometry(arm, 0.05, 0.6).translate(sx * (e - arm / 2), 0.03, sz * e),
        new BoxGeometry(0.6, 0.05, arm).translate(sx * e, 0.03, sz * (e - arm / 2)),
      );
    }
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  for (const p of parts) p.dispose();
  g.deleteAttribute('uv');
  return g.scale(M, M, M);
}

/**
 * Free plots: brass survey marks to build on, lamp marks on public plots. A free deposit shows a
 * seam of crystals in its mineral's colour that catch the light.
 */
export class PlotLayer {
  private readonly marksGeometry = cornerMarks();
  private readonly marksMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  private readonly crystalMaterial: Material;
  private crystalGeometry: BufferGeometry | null = null;
  private marks: InstancedMesh | null = null;
  private seams: InstancedMesh | null = null;
  private key = '';

  constructor(
    private readonly parent: Object3D,
    private readonly terrain: Terrain,
    private readonly radius: number,
    u: SceneUniforms,
  ) {
    this.crystalMaterial = kitMaterial(u, (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float gem; varying float vGem;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGem = gem;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGem; uniform float uTime;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
float g_ = pow(abs(dot(normal, normalize(normalize(vViewPosition) + vec3(.3, .6, .2)))), 22.)
  + .5 * pow(.5 + .5 * sin(uTime * 2.1 + normal.x * 37. + normal.y * 71.), 14.);
totalEmissiveRadiance += vColor * vGem * (.2 + 2.4 * g_);`,
        );
    });
  }

  setWorld(w: WorldView): void {
    const taken = new Set([
      ...w.buildings.map((b) => b.plotId),
      ...w.clientAssets.map((a) => a.plotId),
      ...w.contractSites.map((c) => c.plotId),
    ]);
    // The world view is resent on any change; the marks rebuild only when plots fill or free up.
    const key = `${w.plots.length}:${[...taken].sort((a, b) => a - b).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    const free = w.plots.filter((p) => p.kind !== 'hub' && !taken.has(p.id));
    const marked = free.filter((p) => p.kind === 'build' || p.kind === 'public');
    const deposits = free.filter((p) => p.deposit);
    if (!this.crystalGeometry) {
      const rng = createRng(deriveSeed(w.seed, 'crystals'));
      this.crystalGeometry = crystalGeometry(() => rng.next());
    }
    for (const mesh of [this.marks, this.seams]) {
      mesh?.removeFromParent();
      mesh?.dispose();
    }
    const m = new Matrix4();
    const c = new Color();
    this.marks = this.instanced(this.marksGeometry, this.marksMaterial, marked.length);
    marked.forEach((p, i) => {
      this.marks!.setMatrixAt(
        i,
        standAt(p.dir, this.radius, this.terrain, plotYaw(p.id), m, 0.02 * M),
      );
      this.marks!.setColorAt(i, c.set(MARK[p.kind as keyof typeof MARK]));
    });
    this.seams = this.instanced(this.crystalGeometry, this.crystalMaterial, deposits.length);
    deposits.forEach((p, i) => {
      const size = 0.8 + 0.6 * Math.min(1.4, p.deposit!.richness);
      standAt(p.dir, this.radius, this.terrain, plotYaw(p.id) * 3, m, -0.2 * M);
      this.seams!.setMatrixAt(i, m.scale(new Vector3(size, size, size)));
      this.seams!.setColorAt(i, c.set(MINERALS[p.deposit!.goodId].color));
    });
    this.seams.castShadow = true;
  }

  update(view: GlobeCameraState): void {
    const on = visibleLayers(view.altitude).plotMarkers;
    if (this.marks) this.marks.visible = on;
    if (this.seams) this.seams.visible = on;
  }

  dispose(): void {
    for (const mesh of [this.marks, this.seams]) {
      mesh?.removeFromParent();
      mesh?.dispose();
    }
    this.marksGeometry.dispose();
    this.crystalGeometry?.dispose();
    this.marksMaterial.dispose();
    this.crystalMaterial.dispose();
  }

  private instanced(geometry: BufferGeometry, material: Material, count: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
    mesh.count = count;
    // Colours from the first frame, so the shader is built with them.
    mesh.setColorAt(0, new Color(1, 1, 1));
    this.parent.add(mesh);
    return mesh;
  }
}

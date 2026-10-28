import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Frustum,
  Matrix4,
  Mesh,
  Sphere,
  Vector3,
  type Material,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import type { SurfaceClass } from '../../shared/terrain';
import { len, scale, sub, type Vec3 } from '../../shared/vec3';
import { TERRAIN_COLORS } from '../materials';
import type { ChunkRequest } from './chunk.worker';
import type { ChunkMeshData } from './chunkGeometry';
import { children, keyOf, nodeBounds, ROOTS, selectChunks, type ChunkKey } from './quadtree';

const MAX_IN_FLIGHT = 8;

export interface ChunkStreamerOptions {
  seed: number;
  radius: number;
  workers: number;
  cacheSize: number;
  material: Material;
}

/** Streams terrain chunks from worker threads into an LRU cache and shows the right level of detail. */
export class ChunkStreamer {
  private readonly workers: { worker: Worker; busy: number }[];
  // Map order is the LRU order: shown chunks move to the end.
  private readonly cache = new Map<string, Mesh>();
  private readonly pending = new Set<string>();
  private shown = 0;
  private readonly frustum = new Frustum();
  private readonly matrix = new Matrix4();
  private readonly sphere = new Sphere();

  constructor(
    private readonly parent: Object3D,
    private readonly o: ChunkStreamerOptions,
  ) {
    const colors = {} as Record<SurfaceClass, [number, number, number]>;
    for (const [k, hex] of Object.entries(TERRAIN_COLORS)) {
      const c = new Color(hex);
      colors[Number(k) as SurfaceClass] = [c.r, c.g, c.b];
    }
    const init: ChunkRequest = { t: 'init', seed: o.seed, radius: o.radius, colors };
    this.workers = Array.from({ length: o.workers }, () => {
      const worker = new Worker(new URL('./chunk.worker.ts', import.meta.url), { type: 'module' });
      const slot = { worker, busy: 0 };
      worker.onmessage = (e: MessageEvent<ChunkMeshData>) => {
        slot.busy--;
        this.receive(e.data);
      };
      worker.postMessage(init);
      return slot;
    });
  }

  update(camera: PerspectiveCamera): void {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    const { x, y, z } = camera.position;
    const cam: Vec3 = [x, y, z];
    const leaves = selectChunks(cam, this.o.radius, (c, r) =>
      this.frustum.intersectsSphere(this.sphere.set(new Vector3(c[0], c[1], c[2]), r)),
    );
    this.request(leaves, cam);
    this.show(leaves);
    this.evict();
  }

  stats(): { visible: number; pending: number; cached: number } {
    return { visible: this.shown, pending: this.pending.size, cached: this.cache.size };
  }

  dispose(): void {
    for (const { worker } of this.workers) worker.terminate();
    for (const mesh of this.cache.values()) {
      this.parent.remove(mesh);
      mesh.geometry.dispose();
    }
    this.cache.clear();
    this.pending.clear();
  }

  /** Asks the least busy worker for missing leaves, nearest first. */
  private request(leaves: ChunkKey[], cam: Vec3): void {
    const missing = leaves
      .filter((k) => !this.cache.has(keyOf(k)) && !this.pending.has(keyOf(k)))
      .map((k) => ({ k, d: len(sub(cam, scale(nodeBounds(k).center, this.o.radius))) }))
      .sort((a, b) => a.d - b.d);
    for (const { k } of missing) {
      if (this.pending.size >= MAX_IN_FLIGHT) break;
      const slot = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
      slot.busy++;
      this.pending.add(keyOf(k));
      const msg: ChunkRequest = { t: 'build', key: k };
      slot.worker.postMessage(msg);
    }
  }

  /** Shows the wanted leaves; where some of a node's leaves are not built yet, shows the node instead. */
  private show(leaves: ChunkKey[]): void {
    const wanted = new Set(leaves.map(keyOf));
    const inner = new Set<string>();
    for (const k of leaves) {
      for (let level = 0; level < k.level; level++) {
        const shift = k.level - level;
        inner.add(keyOf({ face: k.face, level, x: k.x >> shift, y: k.y >> shift }));
      }
    }
    const collect = (k: ChunkKey): string[] | null => {
      const id = keyOf(k);
      if (wanted.has(id)) return this.cache.has(id) ? [id] : null;
      if (!inner.has(id)) return [];
      const parts: string[] = [];
      for (const child of children(k)) {
        const got = collect(child);
        if (!got) return this.cache.has(id) ? [id] : null;
        parts.push(...got);
      }
      return parts;
    };
    const draw = new Set(ROOTS.flatMap((root) => collect(root) ?? []));
    for (const [id, mesh] of [...this.cache]) {
      mesh.visible = draw.has(id);
      if (mesh.visible) {
        this.cache.delete(id);
        this.cache.set(id, mesh);
      }
    }
    this.shown = draw.size;
  }

  private evict(): void {
    for (const [id, mesh] of this.cache) {
      if (this.cache.size <= this.o.cacheSize) break;
      if (mesh.visible) continue;
      this.parent.remove(mesh);
      mesh.geometry.dispose();
      this.cache.delete(id);
    }
  }

  private receive(c: ChunkMeshData): void {
    this.pending.delete(c.key);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(c.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(c.normals, 3));
    geometry.setAttribute('color', new BufferAttribute(c.colors, 3));
    geometry.setIndex(new BufferAttribute(c.indices, 1));
    const mesh = new Mesh(geometry, this.o.material);
    mesh.position.set(c.center[0], c.center[1], c.center[2]);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.visible = false;
    this.parent.add(mesh);
    this.cache.set(c.key, mesh);
  }
}

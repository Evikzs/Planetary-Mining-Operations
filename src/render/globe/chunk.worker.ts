import { createTerrain, type SurfaceClass, type Terrain } from '../../shared/terrain';
import { buildChunk, type ChunkMeshData } from './chunkGeometry';
import type { ChunkKey } from './quadtree';

export type ChunkRequest =
  | {
      t: 'init';
      seed: number;
      radius: number;
      colors: Record<SurfaceClass, [number, number, number]>;
    }
  | { t: 'build'; key: ChunkKey };

interface WorkerScope {
  postMessage(msg: ChunkMeshData, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ChunkRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let job: Omit<Extract<ChunkRequest, { t: 'init' }>, 't' | 'seed'> & { terrain: Terrain } = {
  radius: 0,
  colors: { 0: [0, 0, 0], 1: [0, 0, 0], 2: [0, 0, 0], 3: [0, 0, 0], 4: [0, 0, 0] },
  terrain: createTerrain(0),
};

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.t === 'init') {
    job = { radius: msg.radius, colors: msg.colors, terrain: createTerrain(msg.seed, msg.radius) };
    return;
  }
  const c = buildChunk(msg.key, job.radius, job.terrain, job.colors);
  scope.postMessage(c, [c.positions.buffer, c.normals.buffer, c.colors.buffer, c.indices.buffer]);
};

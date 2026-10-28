import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { LUNA_RADIUS } from '../shared/scale';
import { createTerrain } from '../shared/terrain';
import { normalize, type Vec3 } from '../shared/vec3';
import type { MotionView, WorldView } from '../sim/views';
import { sectionAt } from '../sim/world/sections';
import { palette } from '../ui/tokens';
import { clipPlanes, createDprController, gameTimeAt } from './frame';
import { createSky } from './sky';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  frameMsAvg: number;
  dpr: number;
  chunksVisible: number;
  chunksPending: number;
  rovers: number;
  crates: number;
  walkers: number;
}

/** What a tap on the map hit. Not named Pick: that would shadow TypeScript's Pick<T, K>. */
export interface MapPick {
  kind: 'plot' | 'building' | 'rover' | 'section';
  id: number;
}

export interface GameRenderer {
  setWorld(w: WorldView): void;
  setMotion(m: MotionView, anchorRealMs: number, timescale: number): void;
  freezeAt(gameTime: number | null): void;
  project(dir: Vec3, lift?: number): { x: number; y: number } | null;
  pick(x: number, y: number): MapPick | null;
  stats(): RenderStats;
  dispose(): void;
}

/** Something drawn that moves with game time or the camera; the globe and world layers are layers. */
export interface Layer {
  update(gameTime: number, camera: PerspectiveCamera): void;
  dispose(): void;
}

const FOV = 50;
// Until the globe camera arrives (task 27), the view hangs over the southern latitudes.
const START_DIR = normalize([0, -0.6, 0.8]);
const START_ALTITUDE = 200;

export function createRenderer(
  canvas: HTMLCanvasElement,
  opts: { seed: number; reducedMotion: boolean },
): GameRenderer {
  const radius = LUNA_RADIUS;
  const terrain = createTerrain(opts.seed);
  const gl = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  gl.info.autoReset = false;
  gl.autoClear = false;
  gl.setClearColor(palette.navy);
  const dpr = createDprController(Math.min(window.devicePixelRatio || 1, 2));
  gl.setPixelRatio(dpr.value);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 1000);
  scene.add(camera);
  // The key light rides with the camera, so the side you look at is always lit.
  const key = new DirectionalLight(palette.cream, 1.6);
  key.position.set(-0.5, 0.8, 0.3);
  camera.add(key, key.target);
  scene.add(new AmbientLight(palette.cream, 0.35));
  const sky = createSky(opts.seed, FOV);
  const layers: Layer[] = [];

  camera.position.set(
    ...(START_DIR.map((v) => v * (radius + START_ALTITUDE)) as [number, number, number]),
  );
  camera.lookAt(0, 0, 0);

  let width = 0;
  let height = 0;
  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    gl.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    sky.setAspect(camera.aspect);
  }

  function updateCamera(): void {
    const { near, far } = clipPlanes(camera.position.length() - radius, radius);
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  let world: WorldView | null = null;
  let motion: { view: MotionView; anchorRealMs: number; timescale: number } | null = null;
  let frozenAt: number | null = null;
  const gameTime = (): number =>
    frozenAt ??
    (motion ? gameTimeAt(motion.view.tick, motion.anchorRealMs, motion.timescale, Date.now()) : 0);

  let raf = 0;
  let last = 0;
  function frame(t: number): void {
    raf = requestAnimationFrame(frame);
    if (last > 0) {
      const ratio = dpr.update(t - last);
      if (ratio !== null) gl.setPixelRatio(ratio);
    }
    last = t;
    resize();
    updateCamera();
    const time = gameTime();
    for (const layer of layers) layer.update(time, camera);
    gl.info.reset();
    gl.clear();
    sky.render(gl, camera);
    gl.clearDepth();
    gl.render(scene, camera);
  }

  // A hidden tab draws nothing.
  const onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  updateCamera();
  if (!document.hidden) raf = requestAnimationFrame(frame);

  const point = new Vector3();
  const raycaster = new Raycaster();
  const globe = new Sphere(new Vector3(), radius);

  return {
    setWorld(w) {
      world = w;
    },
    setMotion(view, anchorRealMs, timescale) {
      motion = { view, anchorRealMs, timescale };
    },
    freezeAt(time) {
      frozenAt = time;
    },
    project(dir, lift = 0) {
      const r = radius + terrain.height(dir) + lift;
      point.set(dir[0] * r, dir[1] * r, dir[2] * r);
      // Behind the globe: the camera is below this point's horizon.
      if (camera.position.dot(point) <= point.lengthSq()) return null;
      point.project(camera);
      if (point.z > 1) return null;
      return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
    },
    pick(x, y) {
      if (!world || width === 0 || height === 0) return null;
      raycaster.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
      const hit = raycaster.ray.intersectSphere(globe, new Vector3());
      if (!hit) return null;
      const section = world.sections[sectionAt(world.sections, normalize([hit.x, hit.y, hit.z]))];
      return section ? { kind: 'section', id: section.id } : null;
    },
    stats: () => ({
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      frameMsAvg: dpr.frameMsAvg,
      dpr: dpr.value,
      chunksVisible: 0,
      chunksPending: 0,
      rovers: 0,
      crates: 0,
      walkers: 0,
    }),
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const layer of layers) layer.dispose();
      sky.dispose();
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}

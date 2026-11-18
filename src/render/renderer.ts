import {
  Color,
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { industrialEase } from '../shared/ease';
import { LUNA_RADIUS } from '../shared/scale';
import { createTerrain } from '../shared/terrain';
import { dot, latLon, normalize, type Vec3 } from '../shared/vec3';
import type { MotionView, UiSnapshot, WorldView } from '../sim/views';
import { sectionAt } from '../sim/world/sections';
import { ink } from '../ui/tokens';
import { createCameraController } from './camera/controller';
import {
  cameraPose,
  createCameraState,
  MAX_ALTITUDE,
  flyBetween,
  spinAboutPole,
  type GlobeCameraState,
} from './camera/globeCamera';
import { clipPlanes, createDprController, gameTimeAt } from './frame';
import { ChunkStreamer } from './globe/chunkStreamer';
import { terrainMaterial } from './materials';
import type { MapFilter } from './overlays/filters';
import { SectionOverlay } from './overlays/sectionOverlay';
import { createComposer, type Quality } from './post/composer';
import { createSky } from './sky';
import { SOL } from './system/sol';
import { SystemView, type BodyMark } from './system/systemView';
import { localHour, sunDirection, windowsLit } from './sun';
import { BeltLayer } from './world/beltLayer';
import { BuildingLayer } from './world/buildingLayer';
import { createSceneUniforms, glowTexture } from './world/kit';
import { LightLayer } from './world/lightLayer';
import { PlotPicker } from './world/picking';
import { PlotLayer } from './world/plotLayer';
import { RoadLayer } from './world/roadLayer';
import { RoverLayer } from './world/roverLayer';
import { TrafficLayer } from './world/trafficLayer';
import { WalkerLayer } from './world/walkerLayer';

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
  /** 'body': a world of Sol in the system view, by its index in SOL. */
  kind: 'plot' | 'building' | 'rover' | 'section' | 'body';
  id: number;
}

export type ViewMode = 'moon' | 'system';

export interface GameRenderer {
  setWorld(w: WorldView): void;
  setMotion(m: MotionView, anchorRealMs: number, timescale: number): void;
  freezeAt(gameTime: number | null): void;
  project(dir: Vec3, lift?: number): { x: number; y: number } | null;
  pick(x: number, y: number): MapPick | null;
  /** Where a picked thing shows, in CSS pixels, and how large: for the corner marks round it. */
  screenBox(pick: MapPick): { x: number; y: number; size: number } | null;
  stats(): RenderStats;
  camera(): GlobeCameraState;
  setCamera(s: GlobeCameraState): void;
  /** Flies the camera to look down on `dir` from `altitude`, over `ms` (at once when 0). */
  flyTo(dir: Vec3, altitude: number, ms: number): void;
  /** Turns the Moon slowly under the camera, as behind the founding screen. */
  setSpin(on: boolean): void;
  /** The Moon view or the view of all Sol. */
  mode(): ViewMode;
  /** Up to the view of Sol: from high orbit, after flying up there if lower. */
  rise(): void;
  /** Down from the view of Sol to Luna, where the Moon view takes over. */
  dive(): void;
  /** Names of Sol's worlds in sight, in the system view; empty in the Moon view. */
  bodyMarks(): BodyMark[];
  setFilter(f: MapFilter): void;
  /** Live building status, progress, power and morale, which the world view leaves out. */
  setUi(ui: UiSnapshot): void;
  dispose(): void;
}

export interface RendererOptions {
  seed: number;
  reducedMotion: boolean;
  /** High: bloom, MSAA and shadows. Low: none of them, for software rendering and old machines. */
  quality: Quality;
  /** Keeps the pixel ratio still, so frozen screenshots do not depend on frame speed. */
  fixedPixelRatio?: boolean;
  /** A click on the map, with what it hit. */
  onPick?(pick: MapPick | null): void;
  /** A right-click on the map that did not drag. */
  onCancel?(): void;
  /** The camera moved, turned, zoomed or changed lock north. */
  onCamera?(s: GlobeCameraState): void;
  onGesture?(kind: 'panned' | 'zoomed'): void;
  /** The view changed between the Moon and Sol. */
  onMode?(mode: ViewMode): void;
  /** In the system view: the depth gauge (0 far to 1 near) and the distance from the Sun in AU. */
  onSystem?(gauge: number, au: number): void;
}

/** Something drawn that moves with game time or the camera; the globe and world layers are layers. */
export interface Layer {
  update(gameTime: number, camera: PerspectiveCamera, view: GlobeCameraState): void;
  dispose(): void;
}

const FOV = 50;
// The first view hangs over the southern latitudes, where companies are founded.
const START_DIR = normalize([0, -0.6, 0.8]);
const START_ALTITUDE = 200;
/** One turn of the Moon in four minutes. */
const SPIN_RADIANS_PER_MS = (2 * Math.PI) / 240_000;
/** A bus is small: a tap this close to one, in CSS pixels, picks it. */
const BUS_REACH_PX = 22;

const SUN_STRENGTH = 1.25;
/** Sky light on an airless world: a little grey by day, a little cold light by night. */
const DAY_AMBIENT = new Color(0.09, 0.09, 0.095);
const NIGHT_AMBIENT = new Color(0.06, 0.068, 0.1);
const SHADOW_MAP = 2048;
/** Shadows are drawn up to this altitude; above it the globe shades itself. */
const SHADOW_ALTITUDE = 30;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function createRenderer(canvas: HTMLCanvasElement, opts: RendererOptions): GameRenderer {
  const radius = LUNA_RADIUS;
  const terrain = createTerrain(opts.seed);
  const high = opts.quality === 'high';
  const gl = new WebGLRenderer({ canvas, antialias: !high, powerPreference: 'high-performance' });
  gl.info.autoReset = false;
  gl.toneMapping = NeutralToneMapping;
  gl.shadowMap.enabled = high;
  gl.shadowMap.type = PCFShadowMap;
  gl.setClearColor(ink.night);
  const dpr = createDprController(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
  gl.setPixelRatio(dpr.value);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 1000);
  scene.add(camera);
  const u = createSceneUniforms(opts.seed);
  const sky = createSky(gl, opts.seed, opts.reducedMotion);
  scene.add(sky.group);
  // The sun, with soft shadows round the camera target, and a dim light from the sky.
  const sun = new DirectionalLight(0xffffff, 0);
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = -0.0004;
  // Blur the shadow edge over a few map texels so it never shows the texel steps.
  sun.shadow.radius = 3;
  const hemi = new HemisphereLight(0xffffff, 0xffffff, Math.PI);
  scene.add(sun, sun.target, hemi);
  const composer = createComposer(gl, scene, camera, opts.quality);
  const glow = glowTexture();
  const layers: Layer[] = [];

  const terrainMat = terrainMaterial(u, !high);
  const globe = new ChunkStreamer(scene, {
    seed: opts.seed,
    radius,
    workers: Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 2)),
    cacheSize: 512,
    material: terrainMat,
  });
  layers.push({
    update: (_time, cam) => globe.update(cam),
    dispose: () => {
      globe.dispose();
      terrainMat.dispose();
    },
  });

  const overlay = new SectionOverlay(scene, terrain, radius);
  const buildings = new BuildingLayer(scene, terrain, radius, u, opts.reducedMotion);
  const plots = new PlotLayer(scene, terrain, radius, u);
  const picker = new PlotPicker(terrain, radius);
  const roads = new RoadLayer(scene, terrain, radius);
  const belts = new BeltLayer(scene, terrain, radius, u, opts.reducedMotion);
  const rovers = new RoverLayer(scene, terrain, radius, u, glow);
  const walkers = new WalkerLayer(scene, terrain, radius, u, opts.reducedMotion);
  const traffic = new TrafficLayer(scene, terrain, radius);
  const lights = new LightLayer(scene, terrain, radius, u, glow, opts.reducedMotion);
  layers.push(
    { update: (time, _cam, view) => rovers.update(time, view), dispose: () => rovers.dispose() },
    { update: (time, _cam, view) => walkers.update(time, view), dispose: () => walkers.dispose() },
    { update: (_time, _cam, view) => traffic.update(view), dispose: () => traffic.dispose() },
    { update: (_time, _cam, view) => roads.update(view), dispose: () => roads.dispose() },
    { update: (time, _cam, view) => belts.update(time, view), dispose: () => belts.dispose() },
    { update: (_time, _cam, view) => overlay.update(view), dispose: () => overlay.dispose() },
    { update: (_time, _cam, view) => buildings.update(view), dispose: () => buildings.dispose() },
    { update: (_time, _cam, view) => plots.update(view), dispose: () => plots.dispose() },
    { update: (_time, _cam, view) => lights.update(view), dispose: () => lights.dispose() },
    { update: () => undefined, dispose: () => picker.dispose() },
  );

  // The clock is local solar time at the player's hub; before founding, at longitude 0.
  let refLon = 0;
  let refTarget: number | null = null;
  const T = new Vector3();
  const S = new Vector3();
  const X = new Vector3();
  const Y = new Vector3();
  const UP = new Vector3(0, 1, 0);

  /** Sun, sky light, shadows and exposure for this frame. */
  function light(time: number, dtMs: number): void {
    if (refTarget !== null) refLon += wrap(refTarget - refLon) * (1 - Math.exp(-dtMs / 900));
    const s = sunDirection(time, refLon);
    S.set(...s);
    u.uSunDir.value.copy(S);
    const view = controller.state;
    const e = dot(view.pos, s);
    // From high up the globe shows day and night at once; low down the light is the target's.
    const far = smoothstep(10, 40, view.altitude);
    sun.intensity = Math.PI * SUN_STRENGTH * (far + (1 - far) * smoothstep(-0.02, 0.1, e));
    hemi.color.lerpColors(NIGHT_AMBIENT, DAY_AMBIENT, smoothstep(-0.15, 0.2, e));
    hemi.groundColor.copy(hemi.color).multiplyScalar(0.7);
    hemi.position.set(...view.pos);
    const night = 1 - smoothstep(-0.1, 0.12, e);
    gl.toneMappingExposure = 1 + 0.45 * night * (1 - smoothstep(20, 60, view.altitude));
    composer.setBloom(0.3 + 0.12 * night);
    u.uLit.value = windowsLit(localHour(latLon(view.pos).lon, time, refLon));

    // Shadows round the target, snapped to whole texels so they hold still as the camera moves.
    const shadows = high && view.altitude < SHADOW_ALTITUDE && e > 0.02;
    sun.castShadow = shadows;
    const half = Math.min(SHADOW_ALTITUDE * 1.4, Math.max(2.5, view.altitude * 1.4));
    const texel = (2 * half) / SHADOW_MAP;
    T.set(...view.pos).multiplyScalar(radius + terrain.height(view.pos));
    X.crossVectors(UP, S).normalize();
    Y.crossVectors(S, X);
    const tx = Math.round(T.dot(X) / texel) * texel;
    const ty = Math.round(T.dot(Y) / texel) * texel;
    T.copy(X).multiplyScalar(tx).addScaledVector(Y, ty).addScaledVector(S, T.dot(S));
    const reach = half * 2 + 10;
    sun.target.position.copy(T);
    sun.position.copy(T).addScaledVector(S, reach);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -half;
    cam.right = cam.top = half;
    cam.near = 0.1;
    cam.far = reach * 2;
    cam.updateProjectionMatrix();
    sun.shadow.normalBias = texel * 1.5;
  }

  const controller = createCameraController(canvas, createCameraState(START_DIR, START_ALTITUDE), {
    radius,
    reducedMotion: opts.reducedMotion,
    onTap: (x, y) => opts.onPick?.(pick(x, y)),
    onCancel: () => opts.onCancel?.(),
    onGesture: (kind) => {
      flight = null; // the player takes the camera back
      opts.onGesture?.(kind);
    },
  });
  let flight: { from: GlobeCameraState; to: GlobeCameraState; start: number; ms: number } | null =
    null;
  let spinning = false;

  let width = 0;
  let height = 0;
  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    gl.setSize(w, h, false);
    composer.setSize(w, h, gl.getPixelRatio());
    camera.aspect = w / Math.max(1, h);
    system?.setSize(w, h);
  }

  function updateCamera(): void {
    const s = controller.state;
    const pose = cameraPose(s, radius, terrain.height(s.pos));
    camera.position.set(...pose.position);
    camera.up.set(...pose.up);
    camera.lookAt(...pose.target);
    const { near, far } = clipPlanes(s.altitude, radius);
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  let world: WorldView | null = null;
  /** True while the founding screen shows: the sun then swings to the new charter. */
  let founding = false;
  let motion: { view: MotionView; anchorRealMs: number; timescale: number } | null = null;
  let frozenAt: number | null = null;
  const gameTime = (): number =>
    frozenAt ??
    (motion ? gameTimeAt(motion.view.tick, motion.anchorRealMs, motion.timescale, Date.now()) : 0);

  // The view of Sol, built on first use.
  let mode: ViewMode = 'moon';
  let system: SystemView | null = null;
  /** The Moon camera when the view rose: the view comes back down to it. */
  let saved: GlobeCameraState | null = null;
  let riseAfterFlight = false;
  let lastGauge = -1;
  const LUNA = SOL.findIndex((b) => b.id === 'luna');
  let pickedBody: number | null = null;
  let hoverBody: number | null = null;

  function hubs(): Vec3[] {
    if (!world) return [];
    const owned = world.sections
      .filter((x) => x.owner !== null)
      .sort((a, b) => a.owner! - b.owner!);
    return owned
      .map((x) => world!.plots.find((p) => p.sectionId === x.id && p.kind === 'hub')?.dir)
      .filter((d): d is Vec3 => !!d)
      .slice(0, 4);
  }

  function rise(): void {
    if (mode === 'system') return;
    if (controller.state.altitude < MAX_ALTITUDE * 0.98) {
      // Up to high orbit first; the system view starts from there.
      flight = {
        from: controller.state,
        to: { ...controller.state, altitude: MAX_ALTITUDE },
        start: performance.now(),
        ms: opts.reducedMotion ? 1 : 1400,
      };
      riseAfterFlight = true;
      return;
    }
    system ??= new SystemView({
      reducedMotion: opts.reducedMotion,
      glow,
      onPick: () => undefined,
      onLanded: land,
    });
    system.setSize(width, height);
    saved = controller.state;
    mode = 'system';
    scene.remove(sky.group);
    system.scene.add(sky.group);
    composer.setView(system.scene, system.camera);
    system.setLunaSites(hubs());
    const s = sunDirection(gameTime(), refLon);
    system.rise(
      camera.position.clone(),
      camera.quaternion.clone(),
      radius,
      gameTime() / 1440,
      new Vector3(...s),
    );
    opts.onMode?.('system');
  }

  function land(): void {
    mode = 'moon';
    system?.scene.remove(sky.group);
    scene.add(sky.group);
    composer.setView(scene, camera);
    if (saved) controller.set(saved);
    canvas.style.cursor = '';
    opts.onMode?.('moon');
  }

  // In the system view the pointer and the wheel drive Sol, not the globe: these listeners run
  // before the camera controller's (capture on the target runs first) and stop them.
  let sysDrag: { id: number; x: number; y: number; moved: number } | null = null;
  let lastTap = 0;
  let edgeSince = 0;
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDownCapture = (e: PointerEvent): void => {
    if (mode !== 'system') return;
    e.stopImmediatePropagation();
    if (e.button !== 0) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot be captured.
    }
    sysDrag = { id: e.pointerId, ...local(e), moved: 0 };
  };
  const onMoveCapture = (e: PointerEvent): void => {
    if (mode !== 'system' || !system) return;
    e.stopImmediatePropagation();
    const p = local(e);
    if (sysDrag && sysDrag.id === e.pointerId) {
      const [dx, dy] = [p.x - sysDrag.x, p.y - sysDrag.y];
      sysDrag.moved += Math.abs(dx) + Math.abs(dy);
      sysDrag.x = p.x;
      sysDrag.y = p.y;
      if (sysDrag.moved > 4) system.drag(dx, dy);
      return;
    }
    hoverBody = system.pick(p.x, p.y);
    canvas.style.cursor = hoverBody === null ? 'grab' : 'pointer';
  };
  const onUpCapture = (e: PointerEvent): void => {
    if (mode !== 'system' || !system) return;
    e.stopImmediatePropagation();
    const drag = sysDrag;
    sysDrag = null;
    if (!drag || drag.id !== e.pointerId || drag.moved > 4 || e.type !== 'pointerup') return;
    const p = local(e);
    pickedBody = system.pick(p.x, p.y);
    opts.onPick?.(pickedBody === null ? null : { kind: 'body', id: pickedBody });
    const now = performance.now();
    if (pickedBody === LUNA && now - lastTap < 320) system.dive();
    lastTap = now;
  };
  const onWheelCapture = (e: WheelEvent): void => {
    if (mode === 'system' && system) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const d = Math.max(-240, Math.min(240, e.deltaY * (e.deltaMode ? 30 : 1)));
      system.zoom(Math.exp(d * 0.002), hoverBody === LUNA || pickedBody === LUNA);
      return;
    }
    // A push past the top of orbit, held for a moment, rises to the view of Sol.
    if (e.deltaY > 0 && controller.state.altitude >= MAX_ALTITUDE * 0.999 && !flight) {
      const now = performance.now();
      if (!edgeSince) edgeSince = now;
      else if (now - edgeSince > 350) {
        edgeSince = 0;
        rise();
      }
    } else edgeSince = 0;
  };
  canvas.addEventListener('pointerdown', onDownCapture, { capture: true });
  canvas.addEventListener('pointermove', onMoveCapture, { capture: true });
  canvas.addEventListener('pointerup', onUpCapture, { capture: true });
  canvas.addEventListener('pointercancel', onUpCapture, { capture: true });
  canvas.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });

  let raf = 0;
  let last = 0;
  function frame(t: number): void {
    raf = requestAnimationFrame(frame);
    if (last > 0 && !opts.fixedPixelRatio) {
      const ratio = dpr.update(t - last);
      if (ratio !== null) {
        gl.setPixelRatio(ratio);
        composer.setSize(width, height, ratio);
      }
    }
    if (mode === 'system' && system) {
      const dt = last > 0 ? t - last : 0;
      last = t;
      resize();
      const time = gameTime();
      system.update(dt, time / 1440, new Vector3(...sunDirection(time, refLon)));
      sky.update(t / 1000, gl.getPixelRatio());
      gl.toneMappingExposure = 1;
      composer.setBloom(0.3);
      gl.info.reset();
      composer.render();
      const g = system.gauge();
      if (Math.abs(g - lastGauge) > 0.004) {
        lastGauge = g;
        opts.onSystem?.(g, system.au());
      }
      return;
    }
    if (flight) {
      const u = Math.min(1, (t - flight.start) / flight.ms);
      controller.set(flyBetween(flight.from, flight.to, industrialEase(u)));
      if (u >= 1) {
        flight = null;
        if (riseAfterFlight) {
          riseAfterFlight = false;
          rise();
        }
      }
    } else if (spinning && last > 0) {
      controller.set(spinAboutPole(controller.state, (t - last) * SPIN_RADIANS_PER_MS));
    }
    const dt = last > 0 ? t - last : 0;
    if (controller.update(dt)) opts.onCamera?.(controller.state);
    last = t;
    resize();
    updateCamera();
    const time = gameTime();
    // Limbs and glints move while the clock runs.
    if (frozenAt === null && !opts.reducedMotion) u.uTime.value += dt / 1000;
    light(time, dt);
    sky.update(t / 1000, gl.getPixelRatio());
    for (const layer of layers) layer.update(time, camera, controller.state);
    gl.info.reset();
    composer.render();
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
  const spot = new Vector3();
  const raycaster = new Raycaster();
  const surface = new Sphere(new Vector3(), radius);

  /** Where a world point shows on the canvas, in CSS pixels; null when out of sight. */
  function screenOf(at: Vector3): { x: number; y: number } | null {
    // Behind the globe: the camera is below this point's horizon.
    if (camera.position.dot(at) <= at.lengthSq()) return null;
    point.copy(at).project(camera);
    if (point.z > 1) return null;
    return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height };
  }

  function pick(x: number, y: number): MapPick | null {
    if (!world || width === 0 || height === 0) return null;
    const bus = rovers.nearest((at) => {
      const p = screenOf(at);
      return p ? Math.hypot(p.x - x, p.y - y) : Infinity;
    }, BUS_REACH_PX);
    if (bus !== null) return { kind: 'rover', id: bus };
    raycaster.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
    const onPlot = picker.pick(raycaster);
    if (onPlot) return onPlot;
    const hit = raycaster.ray.intersectSphere(surface, new Vector3());
    if (!hit) return null;
    const section = world.sections[sectionAt(world.sections, normalize([hit.x, hit.y, hit.z]))];
    return section ? { kind: 'section', id: section.id } : null;
  }

  return {
    setWorld(w) {
      world = w;
      overlay.setWorld(w);
      buildings.setWorld(w);
      plots.setWorld(w);
      picker.setWorld(w);
      roads.setWorld(w);
      belts.setWorld(w);
      traffic.setWorld(w);
      lights.setWorld(w);
      const doors = new Map(w.plots.map((p) => [p.id, p.dir]));
      walkers.setDoors(
        new Map(
          w.buildings.flatMap((b) => (doors.has(b.plotId) ? [[b.id, doors.get(b.plotId)!]] : [])),
        ),
      );
    },
    setUi(ui) {
      buildings.setUi(ui);
      const home = ui.company ? ui.sections[0] : undefined;
      const hub = home && world?.plots.find((p) => p.sectionId === home.id && p.kind === 'hub');
      if (hub) {
        const lon = latLon(hub.dir).lon;
        // A game loaded with its company takes the hub's sun at once; a new charter swings to it.
        if (refTarget === null && !founding) refLon = lon;
        refTarget = lon;
      }
      founding = !ui.company;
    },
    setMotion(view, anchorRealMs, timescale) {
      motion = { view, anchorRealMs, timescale };
      belts.setMotion(view);
      rovers.setTrips(view.trips);
      walkers.setTrips(view.trips);
      traffic.setTrips(view.trips, view.tick);
    },
    freezeAt(time) {
      frozenAt = time;
    },
    project(dir, lift = 0) {
      const r = radius + terrain.height(dir) + lift;
      return screenOf(spot.set(dir[0] * r, dir[1] * r, dir[2] * r));
    },
    pick,
    screenBox(p) {
      if (!world || p.kind === 'section' || p.kind === 'body') return null;
      let base: Vector3;
      let lift: number;
      if (p.kind === 'rover') {
        const at = rovers.positionOf(p.id);
        if (!at) return null;
        base = spot.copy(at);
        lift = 0.12;
      } else {
        const plotId =
          p.kind === 'plot' ? p.id : world.buildings.find((b) => b.id === p.id)?.plotId;
        const plot = world.plots.find((x) => x.id === plotId);
        if (!plot) return null;
        const r = radius + terrain.height(plot.dir);
        base = spot.set(plot.dir[0] * r, plot.dir[1] * r, plot.dir[2] * r);
        lift = 0.5;
      }
      const a = screenOf(base);
      const top = screenOf(base.clone().multiplyScalar((base.length() + lift) / base.length()));
      if (!a || !top) return null;
      const tall = Math.hypot(top.x - a.x, top.y - a.y);
      return {
        x: (a.x + top.x) / 2,
        y: (a.y + top.y) / 2,
        size: Math.min(320, Math.max(26, tall * (p.kind === 'rover' ? 2.4 : 1.6))),
      };
    },
    stats: () => ({
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      frameMsAvg: dpr.frameMsAvg,
      dpr: dpr.value,
      chunksVisible: globe.stats().visible,
      chunksPending: globe.stats().pending,
      rovers: rovers.shown,
      crates: belts.shown,
      walkers: walkers.shown,
    }),
    camera: () => controller.state,
    setCamera(s) {
      flight = null;
      controller.set(s);
    },
    flyTo(dir, altitude, ms) {
      const to = createCameraState(dir, altitude);
      if (ms > 0) flight = { from: controller.state, to, start: performance.now(), ms };
      else {
        flight = null;
        controller.set(to);
      }
    },
    setSpin(on) {
      spinning = on;
    },
    mode: () => mode,
    rise,
    dive() {
      if (mode === 'system') system?.dive();
    },
    bodyMarks: () => (mode === 'system' && system ? system.marks() : []),
    setFilter(f) {
      overlay.setFilter(f);
      buildings.setFilter(f);
      belts.setFilter(f);
    },
    dispose() {
      cancelAnimationFrame(raf);
      controller.dispose();
      canvas.removeEventListener('pointerdown', onDownCapture, { capture: true });
      canvas.removeEventListener('pointermove', onMoveCapture, { capture: true });
      canvas.removeEventListener('pointerup', onUpCapture, { capture: true });
      canvas.removeEventListener('pointercancel', onUpCapture, { capture: true });
      canvas.removeEventListener('wheel', onWheelCapture, { capture: true });
      if (mode === 'system') land();
      system?.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const layer of layers) layer.dispose();
      sky.dispose();
      composer.dispose();
      glow.dispose();
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}

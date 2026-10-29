import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  compass,
  flyHome,
  gameRenderer,
  mapFilter,
  mapLevel,
  motion,
  reducedMotion,
  selection,
  simClient,
  ui,
  world,
} from '../../client/store';
import { heading, type GlobeCameraState } from '../../render/camera/globeCamera';
import { createRenderer } from '../../render/renderer';
import { LOCAL_MAX_ALT } from '../../shared/scale';
import type { DebugFlags } from '../../worker/protocol';

// The founding camera: down to the hub from where the Moon was turning.
const HOME_ALTITUDE = 4;
const FLY_MS = 1200;
/** Where the last map's camera was, so a fresh canvas for the same world looks at the same spot. */
let kept: { seed: number; camera: GlobeCameraState } | null = null;

/**
 * The map. Its renderer starts once the world's seed is known. A new seed, or a new reduced-motion
 * choice, gets a fresh canvas: a disposed renderer leaves its canvas without a context.
 */
export function MapCanvas({ flags }: { flags: DebugFlags }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seed = world.value?.seed;
  const reduced = reducedMotion.value;
  useEffect(() => {
    if (!canvas.current || seed === undefined) return;
    // The camera beat of the tutorial ends once the player has panned and zoomed.
    const taught = { panned: false, zoomed: false };
    const r = createRenderer(canvas.current, {
      seed,
      reducedMotion: reduced,
      fixedPixelRatio: flags.freeze,
      onPick: (pick) => (selection.value = pick),
      onCamera(s) {
        const h = heading(s);
        const shown = compass.value;
        if (Math.abs(h - shown.heading) > 0.005 || s.lockNorth !== shown.lockNorth) {
          compass.value = { heading: h, lockNorth: s.lockNorth };
        }
        mapLevel.value = s.altitude >= LOCAL_MAX_ALT ? 'planetary' : 'local';
      },
      onGesture(kind) {
        if (taught[kind] || !ui.value?.company || !simClient.value) return;
        taught[kind] = true;
        void simClient.value.send({ t: 'cameraTaught', [kind]: true }).then((res) => {
          if (!res.ok) taught[kind] = false;
        });
      },
    });
    if (kept?.seed === seed) r.setCamera(kept.camera);
    gameRenderer.value = r;
    const stopWorld = effect(() => {
      if (world.value) r.setWorld(world.value);
    });
    const stopFilter = effect(() => r.setFilter(mapFilter.value));
    const stopUi = effect(() => {
      if (ui.value) r.setUi(ui.value);
    });
    // The Moon turns behind the founding screen.
    const stopSpin = effect(() => {
      const snap = ui.value;
      r.setSpin(!!snap && !snap.company && !reduced);
    });
    const stopFly = effect(() => {
      const home = ui.value?.sections[0];
      const hub =
        home && world.value?.plots.find((p) => p.sectionId === home.id && p.kind === 'hub');
      if (!flyHome.value || !hub) return;
      flyHome.value = false;
      r.flyTo(hub.dir, HOME_ALTITUDE, reduced ? 0 : FLY_MS);
    });
    const stopMotion = effect(() => {
      const m = motion.value;
      if (!m) return;
      r.setMotion(m.view, m.anchorRealMs, flags.timescale);
      r.freezeAt(flags.freeze ? m.view.tick : null);
    });
    return () => {
      stopWorld();
      stopFilter();
      stopUi();
      stopMotion();
      stopSpin();
      stopFly();
      kept = { seed, camera: r.camera() };
      r.dispose();
      gameRenderer.value = null;
    };
  }, [seed, flags, reduced]);
  return (
    <canvas
      key={`${seed ?? 'none'}-${reduced}`}
      ref={canvas}
      class="map"
      data-testid="map-canvas"
      aria-label="Map of your operations"
    />
  );
}

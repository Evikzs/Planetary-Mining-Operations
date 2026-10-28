import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { compass, gameRenderer, motion, simClient, ui, world } from '../../client/store';
import { heading } from '../../render/camera/globeCamera';
import { createRenderer } from '../../render/renderer';
import type { DebugFlags } from '../../worker/protocol';

/** The map. Its renderer starts once the world's seed is known; a new seed gets a fresh canvas. */
export function MapCanvas({ flags }: { flags: DebugFlags }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seed = world.value?.seed;
  useEffect(() => {
    if (!canvas.current || seed === undefined) return;
    // The camera beat of the tutorial ends once the player has panned and zoomed.
    const taught = { panned: false, zoomed: false };
    const r = createRenderer(canvas.current, {
      seed,
      reducedMotion: document.documentElement.dataset.motion === 'reduced',
      onCamera(s) {
        const h = heading(s);
        const shown = compass.value;
        if (Math.abs(h - shown.heading) > 0.005 || s.lockNorth !== shown.lockNorth) {
          compass.value = { heading: h, lockNorth: s.lockNorth };
        }
      },
      onGesture(kind) {
        if (taught[kind] || !ui.value?.company || !simClient.value) return;
        taught[kind] = true;
        void simClient.value.send({ t: 'cameraTaught', [kind]: true }).then((res) => {
          if (!res.ok) taught[kind] = false;
        });
      },
    });
    gameRenderer.value = r;
    const stopWorld = effect(() => {
      if (world.value) r.setWorld(world.value);
    });
    const stopMotion = effect(() => {
      const m = motion.value;
      if (!m) return;
      r.setMotion(m.view, m.anchorRealMs, flags.timescale);
      r.freezeAt(flags.freeze ? m.view.tick : null);
    });
    return () => {
      stopWorld();
      stopMotion();
      r.dispose();
      gameRenderer.value = null;
    };
  }, [seed, flags]);
  return (
    <canvas
      key={seed ?? 'none'}
      ref={canvas}
      class="map"
      data-testid="map-canvas"
      aria-label="Map of your operations"
    />
  );
}

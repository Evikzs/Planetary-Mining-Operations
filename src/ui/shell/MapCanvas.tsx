import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { gameRenderer, motion, world } from '../../client/store';
import { createRenderer } from '../../render/renderer';
import type { DebugFlags } from '../../worker/protocol';

/** The map. Its renderer starts once the world's seed is known; a new seed gets a fresh canvas. */
export function MapCanvas({ flags }: { flags: DebugFlags }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seed = world.value?.seed;
  useEffect(() => {
    if (!canvas.current || seed === undefined) return;
    const reducedMotion = document.documentElement.dataset.motion === 'reduced';
    const r = createRenderer(canvas.current, { seed, reducedMotion });
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

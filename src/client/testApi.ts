import { createCameraState, rotate, type GlobeCameraState } from '../render/camera/globeCamera';
import type { MapPick, RenderStats } from '../render/renderer';
import { fromLatLon } from '../shared/vec3';
import type { Command, CommandResult } from '../sim/commands';
import type { UiSnapshot, WorldView } from '../sim/views';
import type { SimClient } from './simClient';
import { gameRenderer, selection, ui, world } from './store';

/** Hooks for e2e tests and debugging; dev and e2e builds put them on window.__pmo. */
export interface TestApi {
  send(cmd: Command): Promise<CommandResult>;
  ui(): UiSnapshot | null;
  world(): WorldView | null;
  advanceRealMs(ms: number): void;
  renderStats(): RenderStats | null;
  camera(): GlobeCameraState | null;
  /** Degrees; heading clockwise from north. A heading of 0 locks north. */
  setCamera(lat: number, lon: number, alt: number, heading: number): void;
  /** Where a plot's pick sphere shows on screen, in CSS pixels; null when out of sight. */
  project(plotId: number): { x: number; y: number } | null;
  /** Selects as a tap on the map would. */
  select(pick: MapPick | null): void;
}

declare global {
  interface Window {
    __pmo: TestApi;
  }
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

export function installTestApi(client: SimClient): void {
  window.__pmo = {
    send: (cmd) => client.send(cmd),
    ui: () => ui.value,
    world: () => world.value,
    advanceRealMs: (ms) => client.post({ t: 'advanceRealMs', ms }),
    renderStats: () => gameRenderer.value?.stats() ?? null,
    camera: () => gameRenderer.value?.camera() ?? null,
    setCamera(lat, lon, alt, heading) {
      const s = createCameraState(fromLatLon(rad(lat), rad(lon)), alt);
      gameRenderer.value?.setCamera(heading ? rotate(s, rad(heading)) : s);
    },
    project(plotId) {
      const plot = world.value?.plots.find((p) => p.id === plotId);
      return (plot && gameRenderer.value?.project(plot.dir, 0.2)) ?? null;
    },
    select(pick) {
      selection.value = pick;
    },
  };
}

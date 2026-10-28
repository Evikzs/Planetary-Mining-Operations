import type { RenderStats } from '../render/renderer';
import type { Command, CommandResult } from '../sim/commands';
import type { UiSnapshot, WorldView } from '../sim/views';
import type { SimClient } from './simClient';
import { gameRenderer, ui, world } from './store';

/** Hooks for e2e tests and debugging; dev and e2e builds put them on window.__pmo. */
export interface TestApi {
  send(cmd: Command): Promise<CommandResult>;
  ui(): UiSnapshot | null;
  world(): WorldView | null;
  advanceRealMs(ms: number): void;
  renderStats(): RenderStats | null;
}

declare global {
  interface Window {
    __pmo: TestApi;
  }
}

export function installTestApi(client: SimClient): void {
  window.__pmo = {
    send: (cmd) => client.send(cmd),
    ui: () => ui.value,
    world: () => world.value,
    advanceRealMs: (ms) => client.post({ t: 'advanceRealMs', ms }),
    renderStats: () => gameRenderer.value?.stats() ?? null,
  };
}

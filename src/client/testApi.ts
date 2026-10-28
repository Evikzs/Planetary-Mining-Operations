import type { Command, CommandResult } from '../sim/commands';
import type { UiSnapshot, WorldView } from '../sim/views';
import type { SimClient } from './simClient';
import { ui, world } from './store';

/** Hooks for e2e tests and debugging; dev and e2e builds put them on window.__pmo. */
export interface TestApi {
  send(cmd: Command): Promise<CommandResult>;
  ui(): UiSnapshot | null;
  world(): WorldView | null;
  advanceRealMs(ms: number): void;
}

export function installTestApi(client: SimClient): void {
  const api: TestApi = {
    send: (cmd) => client.send(cmd),
    ui: () => ui.value,
    world: () => world.value,
    advanceRealMs: (ms) => client.post({ t: 'advanceRealMs', ms }),
  };
  (window as unknown as { __pmo: TestApi }).__pmo = api;
}

import { createMemorySaveStore } from '../save/memoryStore';
import type { GameState } from '../sim/state';
import type { FromWorker, ToWorker } from './protocol';
import { SimHost } from './simHost';

interface WorkerScope {
  postMessage(msg: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}

const scope = self as unknown as WorkerScope;

// shortcut: in-memory saves and a plain codec until the save system (task 5) lands.
const host = new SimHost({
  post: (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  now: () => Date.now(),
  saves: createMemorySaveStore(),
  codec: {
    encode: (state, savedAtRealMs) => ({
      format: 'pmo-save',
      version: 1,
      savedAtRealMs,
      seed: state.seed,
      tick: state.tick,
      state,
      checksum: '',
    }),
    decode: (file) => ({ state: file.state as GameState, savedAtRealMs: file.savedAtRealMs }),
  },
});

scope.onmessage = (e) => {
  void host.handle(e.data);
};
setInterval(() => host.pump(), 250);

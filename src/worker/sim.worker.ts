import { createMemorySaveStore } from '../save/memoryStore';
import { fromSaveFile, toSaveFile } from '../save/saveFile';
import { createIdbSaveStore } from '../save/slots';
import type { FromWorker, ToWorker } from './protocol';
import { SimHost } from './simHost';

interface WorkerScope {
  postMessage(msg: FromWorker, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}

const scope = self as unknown as WorkerScope;

const host = new SimHost({
  post: (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  now: () => Date.now(),
  // Private modes without IndexedDB still play; they just cannot keep a save.
  saves: typeof indexedDB === 'undefined' ? createMemorySaveStore() : createIdbSaveStore(),
  codec: {
    encode: toSaveFile,
    decode: (file) => {
      const res = fromSaveFile(file);
      return res.ok ? { state: res.state, savedAtRealMs: res.savedAtRealMs } : null;
    },
  },
});

scope.onmessage = (e) => {
  void host.handle(e.data);
};
setInterval(() => host.pump(), 250);

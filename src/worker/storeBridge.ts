import type { SlotIo } from '../save/fileStore';
import type { FromWorker, ToWorker } from './protocol';

type StoreResult = Extract<ToWorker, { t: 'storeResult' }>;

/** Slot files reached through the page, which holds the desktop app's save API. */
export function createBridgeSlotIo(post: (msg: FromWorker) => void): {
  io: SlotIo;
  settle(msg: StoreResult): void;
} {
  let nextId = 1;
  const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  const call = (op: 'list' | 'read' | 'write', slot?: string, text?: string) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      post({ t: 'storeCall', id, op, slot, text });
    });
  return {
    io: {
      async list() {
        const v = await call('list');
        return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
      },
      async read(slot) {
        const v = await call('read', slot);
        return typeof v === 'string' ? v : null;
      },
      async write(slot, text) {
        await call('write', slot, text);
      },
    },
    settle(msg) {
      const w = waiting.get(msg.id);
      if (!w) return;
      waiting.delete(msg.id);
      if (msg.ok) w.resolve(msg.value);
      else w.reject(new Error(msg.error ?? 'the save file could not be reached'));
    },
  };
}

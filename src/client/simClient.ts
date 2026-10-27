import type { Command, CommandResult } from '../sim/commands';
import type { FromWorker, ToWorker } from '../worker/protocol';

type Handler<T extends FromWorker['t']> = (msg: Extract<FromWorker, { t: T }>) => void;

export interface SimClient {
  send(cmd: Command): Promise<CommandResult>;
  post(msg: ToWorker): void;
  on<T extends FromWorker['t']>(t: T, fn: Handler<T>): () => void;
  saveNow(): void;
}

export function createSimClient(worker: Worker): SimClient {
  let nextId = 1;
  const pending = new Map<number, (r: CommandResult) => void>();
  const handlers = new Map<string, Set<(msg: FromWorker) => void>>();

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.t === 'commandResult') {
      pending.get(msg.id)?.(msg.result);
      pending.delete(msg.id);
    }
    handlers.get(msg.t)?.forEach((fn) => fn(msg));
  };

  const post = (msg: ToWorker) => worker.postMessage(msg);

  return {
    post,
    send(cmd) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        post({ t: 'command', id, cmd });
      });
    },
    on(t, fn) {
      const set = handlers.get(t) ?? new Set();
      handlers.set(t, set);
      const wrapped = fn as (msg: FromWorker) => void;
      set.add(wrapped);
      return () => set.delete(wrapped);
    },
    saveNow: () => post({ t: 'saveNow' }),
  };
}

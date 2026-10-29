import type { GoodId } from '../data/goods';
import type { Command, CommandResult } from '../sim/commands';
import type { PeopleFilter, PeopleRow } from '../sim/views';
import type { FromWorker, ManualSlot, SaveSlot, ToWorker } from '../worker/protocol';

type Handler<T extends FromWorker['t']> = (msg: Extract<FromWorker, { t: T }>) => void;

export interface SimClient {
  send(cmd: Command): Promise<CommandResult>;
  queryPeople(
    filter: PeopleFilter,
    offset: number,
    limit: number,
  ): Promise<{ total: number; rows: PeopleRow[] }>;
  /** What a market order of this size would clear at now, and how much of it would fill. */
  quote(
    goodId: GoodId,
    side: 'buy' | 'sell',
    kg: number,
  ): Promise<{ priceCents: number; filledKg: number }>;
  /** The game as a 'PMO1.' code. */
  exportSave(): Promise<string>;
  /** Replaces the game with the one in a code; ok is false for a code that is not a save. */
  importSave(code: string): Promise<{ ok: boolean; error?: string }>;
  listSaves(): Promise<SaveSlot[]>;
  manualSave(slot: ManualSlot): Promise<{ slots: SaveSlot[]; error?: string }>;
  manualLoad(slot: ManualSlot): Promise<{ ok: boolean; error?: string }>;
  post(msg: ToWorker): void;
  on<T extends FromWorker['t']>(t: T, fn: Handler<T>): () => void;
  saveNow(): void;
}

const loadResult = (msg: FromWorker) =>
  msg.t === 'loadResult' ? { ok: msg.ok, error: msg.error } : undefined;

export function createSimClient(worker: Worker): SimClient {
  let nextId = 1;
  const replies = new Map<number, (msg: FromWorker) => void>();
  const handlers = new Map<string, Set<(msg: FromWorker) => void>>();

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if ('id' in msg) {
      replies.get(msg.id)?.(msg);
      replies.delete(msg.id);
    }
    handlers.get(msg.t)?.forEach((fn) => fn(msg));
  };

  const post = (msg: ToWorker) => worker.postMessage(msg);

  /** Posts a request under a fresh id; `take` reads the worker's reply to that id. */
  function ask<R>(
    request: (id: number) => ToWorker,
    take: (msg: FromWorker) => R | undefined,
  ): Promise<R> {
    const id = nextId++;
    return new Promise((resolve) => {
      replies.set(id, (msg) => {
        const reply = take(msg);
        if (reply !== undefined) resolve(reply);
      });
      post(request(id));
    });
  }

  return {
    post,
    send: (cmd) =>
      ask(
        (id) => ({ t: 'command', id, cmd }),
        (msg) => (msg.t === 'commandResult' ? msg.result : undefined),
      ),
    queryPeople: (filter, offset, limit) =>
      ask(
        (id) => ({ t: 'queryPeople', id, filter, offset, limit }),
        (msg) => (msg.t === 'peoplePage' ? { total: msg.total, rows: msg.rows } : undefined),
      ),
    quote: (goodId, side, kg) =>
      ask(
        (id) => ({ t: 'quote', id, goodId, side, kg }),
        (msg) =>
          msg.t === 'quoteResult'
            ? { priceCents: msg.priceCents, filledKg: msg.filledKg }
            : undefined,
      ),
    exportSave: () =>
      ask(
        (id) => ({ t: 'exportSave', id }),
        (msg) => (msg.t === 'exportResult' ? msg.code : undefined),
      ),
    importSave: (code) => ask((id) => ({ t: 'importSave', id, code }), loadResult),
    listSaves: () =>
      ask(
        (id) => ({ t: 'listSaves', id }),
        (msg) => (msg.t === 'saveSlots' ? msg.slots : undefined),
      ),
    manualSave: (slot) =>
      ask(
        (id) => ({ t: 'manualSave', id, slot }),
        (msg) => (msg.t === 'saveSlots' ? { slots: msg.slots, error: msg.error } : undefined),
      ),
    manualLoad: (slot) => ask((id) => ({ t: 'manualLoad', id, slot }), loadResult),
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

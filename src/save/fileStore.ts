import { fromSaveFile } from './saveFile';
import { looksLikeSave } from './slots';
import { companyOf, type SaveFile, type SaveStore, type SlotInfo } from './types';

/** Slot files as text; the desktop app reaches them through its preload. */
export interface SlotIo {
  list(): Promise<string[]>;
  read(slot: string): Promise<string | null>;
  write(slot: string, text: string): Promise<void>;
}

const AUTO_SLOTS = ['auto-0', 'auto-1', 'auto-2'];

function parse(text: string | null): SaveFile | null {
  if (text === null) return null;
  try {
    const f: unknown = JSON.parse(text);
    return looksLikeSave(f) ? f : null;
  } catch {
    return null;
  }
}

/** The save store of the desktop app: one JSON file per slot. */
export function createFileSaveStore(io: SlotIo): SaveStore {
  const autos = () =>
    Promise.all(AUTO_SLOTS.map(async (slot) => ({ slot, file: parse(await io.read(slot)) })));
  // The next autosave slot; found once from the files, then it rotates.
  let next: number | null = null;
  // Writes run one at a time: an autosave starts only after the one before it has landed.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    writeAuto: (file) =>
      inTurn(async () => {
        if (next === null) {
          const all = await autos();
          const empty = all.findIndex((a) => !a.file);
          next =
            empty >= 0
              ? empty
              : all.reduce(
                  (oldest, a, i) =>
                    a.file!.savedAtRealMs < all[oldest]!.file!.savedAtRealMs ? i : oldest,
                  0,
                );
        }
        const slot = AUTO_SLOTS[next]!;
        next = (next + 1) % AUTO_SLOTS.length;
        await io.write(slot, JSON.stringify(file));
      }),
    async loadLatestValid(accept) {
      const files = (await autos())
        .flatMap((a) => (a.file ? [a.file] : []))
        .sort((a, b) => b.savedAtRealMs - a.savedAtRealMs);
      return files.find((f) => fromSaveFile(f).ok && (accept?.(f) ?? true)) ?? null;
    },
    writeManual: (slot, file) => inTurn(() => io.write(`manual-${slot}`, JSON.stringify(file))),
    async readManual(slot) {
      const f = parse(await io.read(`manual-${slot}`));
      return f && fromSaveFile(f).ok ? f : null;
    },
    async list() {
      const infos: SlotInfo[] = [];
      for (const slot of await io.list()) {
        const f = parse(await io.read(slot));
        if (f)
          infos.push({ slot, savedAtRealMs: f.savedAtRealMs, tick: f.tick, company: companyOf(f) });
      }
      return infos;
    },
  };
}

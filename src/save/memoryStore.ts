import { companyOf, type SaveFile, type SaveStore } from './types';

/** In-memory SaveStore for tests and for environments without IndexedDB. */
export function createMemorySaveStore(): SaveStore & { writes: number; files: SaveFile[] } {
  const manual = new Map<number, SaveFile>();
  const store = {
    writes: 0,
    files: [] as SaveFile[],
    writeManual(slot: number, file: SaveFile) {
      manual.set(slot, file);
      return Promise.resolve();
    },
    readManual(slot: number) {
      return Promise.resolve(manual.get(slot) ?? null);
    },
    list() {
      return Promise.resolve(
        [...manual]
          .sort(([a], [b]) => a - b)
          .map(([slot, f]) => ({
            slot: `manual-${slot}`,
            savedAtRealMs: f.savedAtRealMs,
            tick: f.tick,
            company: companyOf(f),
          })),
      );
    },
    writeAuto(file: SaveFile) {
      store.writes++;
      store.files.push(file);
      return Promise.resolve();
    },
    loadLatestValid(accept?: (file: SaveFile) => boolean) {
      const newestFirst = [...store.files].reverse();
      return Promise.resolve(newestFirst.find((f) => accept?.(f) ?? true) ?? null);
    },
  };
  return store;
}

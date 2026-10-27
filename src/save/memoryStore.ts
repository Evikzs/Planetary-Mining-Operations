import type { SaveFile, SaveStore } from './types';

/** In-memory SaveStore for tests and for environments without IndexedDB. */
export function createMemorySaveStore(): SaveStore & { writes: number; files: SaveFile[] } {
  const store = {
    writes: 0,
    files: [] as SaveFile[],
    writeAuto(file: SaveFile) {
      store.writes++;
      store.files.push(file);
      return Promise.resolve();
    },
    loadLatestValid() {
      return Promise.resolve(store.files[store.files.length - 1] ?? null);
    },
  };
  return store;
}

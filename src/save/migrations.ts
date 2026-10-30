import type { SaveFile } from './types';

export const SAVE_VERSION = 2;

export type Migrations = Record<number, (s: Record<string, unknown>) => Record<string, unknown>>;

/** MIGRATIONS[n] turns a version-n state into a version-(n+1) state. */
export const MIGRATIONS: Migrations = {
  // 1 → 2: bus trips get their own id counter, started above every id the save holds.
  1: (s) => ({ ...s, nextTripId: s.nextId }),
};

export function migrate(file: SaveFile, registry = MIGRATIONS, target = SAVE_VERSION): SaveFile {
  let version = file.version;
  let state = file.state as Record<string, unknown>;
  while (version < target) {
    const fn = registry[version];
    if (!fn) throw new Error(`no migration from save version ${version}`);
    state = fn(state);
    version++;
  }
  return { ...file, version, state };
}

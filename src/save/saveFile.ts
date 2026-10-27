import { canonicalStringify, cyrb53 } from '../sim/hash';
import { createInitialState, type GameState } from '../sim/state';
import { migrate, SAVE_VERSION } from './migrations';
import { DERIVED_KEYS, deserializeState, serializeState } from './serialize';
import type { SaveFile } from './types';

export { SAVE_VERSION };

export type LoadError = 'BAD_FORMAT' | 'BAD_CHECKSUM' | 'TOO_NEW' | 'INVALID_STATE';
export type LoadResult =
  { ok: true; state: GameState; savedAtRealMs: number } | { ok: false; error: LoadError };

export function computeChecksum(f: Omit<SaveFile, 'checksum' | 'format'>): string {
  const { version, savedAtRealMs, seed, tick, state } = f;
  return cyrb53(canonicalStringify({ version, savedAtRealMs, seed, tick, state })).toString(16);
}

export function toSaveFile(state: GameState, savedAtRealMs: number): SaveFile {
  const base = {
    format: 'pmo-save' as const,
    version: SAVE_VERSION,
    savedAtRealMs,
    seed: state.seed,
    tick: state.tick,
    state: serializeState(state),
  };
  return { ...base, checksum: computeChecksum(base) };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isSaveFileShape(f: unknown): f is SaveFile {
  if (typeof f !== 'object' || f === null) return false;
  const o = f as Record<string, unknown>;
  return (
    o.format === 'pmo-save' &&
    Number.isInteger(o.version) &&
    isNum(o.savedAtRealMs) &&
    isNum(o.seed) &&
    isNum(o.tick) &&
    typeof o.state === 'object' &&
    o.state !== null &&
    typeof o.checksum === 'string'
  );
}

const kind = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Saves are untrusted input: every top-level key of a fresh state must exist with its kind. */
function hasStateShape(state: unknown): state is GameState {
  if (typeof state !== 'object' || state === null) return false;
  const loaded = state as Record<string, unknown>;
  const skeleton = createInitialState(0) as unknown as Record<string, unknown>;
  return Object.entries(skeleton).every(([k, v]) => {
    if (DERIVED_KEYS.includes(k)) return true;
    if (!(k in loaded)) return false;
    return v === null ? true : kind(loaded[k]) === kind(v);
  });
}

export function fromSaveFile(file: unknown): LoadResult {
  if (!isSaveFileShape(file)) return { ok: false, error: 'BAD_FORMAT' };
  if (file.version > SAVE_VERSION) return { ok: false, error: 'TOO_NEW' };
  if (computeChecksum(file) !== file.checksum) return { ok: false, error: 'BAD_CHECKSUM' };
  try {
    const state = deserializeState(migrate(file).state);
    if (!hasStateShape(state)) return { ok: false, error: 'INVALID_STATE' };
    return { ok: true, state, savedAtRealMs: file.savedAtRealMs };
  } catch {
    return { ok: false, error: 'INVALID_STATE' };
  }
}

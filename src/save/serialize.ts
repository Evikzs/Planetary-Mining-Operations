import type { GameState } from '../sim/state';
import { base64ToBytes, bytesToBase64 } from './base64';

/** Top-level state keys rebuilt on load instead of saved (task 9 adds 'world'). */
export const DERIVED_KEYS: string[] = [];

const TYPED: Record<string, (b: ArrayBuffer) => ArrayBufferView> = {
  Int8Array: (b) => new Int8Array(b),
  Uint8Array: (b) => new Uint8Array(b),
  Uint8ClampedArray: (b) => new Uint8ClampedArray(b),
  Int16Array: (b) => new Int16Array(b),
  Uint16Array: (b) => new Uint16Array(b),
  Int32Array: (b) => new Int32Array(b),
  Uint32Array: (b) => new Uint32Array(b),
  Float32Array: (b) => new Float32Array(b),
  Float64Array: (b) => new Float64Array(b),
};

function encode(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return { $ta: v.constructor.name, b64: bytesToBase64(bytes) };
  }
  if (Array.isArray(v)) return v.map(encode);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encode(x);
  return out;
}

function decode(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decode);
  const o = v as Record<string, unknown>;
  if (typeof o.$ta === 'string' && typeof o.b64 === 'string') {
    const make = TYPED[o.$ta];
    if (!make) throw new Error(`unknown typed array: ${o.$ta}`);
    const bytes = base64ToBytes(o.b64);
    return make(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) out[k] = decode(x);
  return out;
}

export function serializeState(state: GameState): unknown {
  const copy: Record<string, unknown> = { ...state };
  for (const k of DERIVED_KEYS) delete copy[k];
  return encode(copy);
}

export function deserializeState(data: unknown): GameState {
  const state = decode(data) as GameState;
  rebuildDerived(state);
  return state;
}

function rebuildDerived(state: GameState): void {
  void state; // task 9 regenerates the world from the seed here
}

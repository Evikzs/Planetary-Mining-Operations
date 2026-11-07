import type { GameState } from '../sim/state';
import { base64ToBytes, bytesToBase64 } from './base64';
import { openBooks } from '../sim/finance/books';
import { freshCredit } from '../sim/finance/credit';
import { listCompany } from '../sim/finance/shares';
import { ensureRivals } from '../sim/rivals/founding';

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

/**
 * Fills fields that saves from earlier pushes lack, in order, after migration. Each task that adds
 * state appends its step.
 */
export const UPGRADES: ((s: GameState) => void)[] = [
  // Defaults that later steps read go first: no loans, credit or shares before M2a C5–C6.
  (s) => {
    s.loans ??= [];
    s.listings ??= [];
    s.holdings ??= [];
    s.shareOrders ??= [];
    s.auctions ??= [];
    for (const c of s.companies) c.credit ??= freshCredit();
  },
  // M2a C3: companies without books open them from what they hold.
  (s) => {
    for (const c of s.companies) if (!(c as Partial<typeof c>).books) openBooks(s, c.id);
  },
  // M2a C4: books opened before the monthly close have no closed months yet.
  (s) => {
    for (const c of s.companies) c.books.closed ??= [];
  },
  // M2a C8: games from before rivals get them now.
  (s) => {
    s.withRivals ??= true;
    for (const c of s.companies) c.colour ??= c.kind === 'player' ? 'burntOrange' : 'teal';
  },
  // M2a C6: companies founded before shares get listed now.
  (s) => {
    for (const c of s.companies) {
      if (!s.listings.some((l) => l.companyId === c.id)) listCompany(s, c.id);
    }
  },
  ensureRivals,
  // M2a C11: bankruptcy fields, and land on each bought section: earlier purchases share the
  // land on the books.
  (s) => {
    for (const c of s.companies) {
      c.bankruptTick ??= null;
      c.successorId ??= null;
    }
    for (const sec of s.sections) sec.landCents ??= 0;
    s.news ??= [];
    for (const c of s.companies) {
      const bought = s.sections.filter((x) => x.owner === c.id && x.id !== c.charterSectionId);
      const rest = c.books.landCents - bought.reduce((n, x) => n + x.landCents, 0);
      if (rest <= 0 || bought.length === 0) continue;
      const each = Math.floor(rest / bought.length);
      bought.forEach((x, i) => (x.landCents += each + (i === 0 ? rest - each * bought.length : 0)));
    }
  },
  // M2a C16: auctions replace the land office.
  (s) => {
    const codex = s.story.codex.map((id) => (id === 'mech.landOffice' ? 'mech.auctions' : id));
    s.story.codex = [...new Set(codex)];
    delete (s as Partial<GameState> & { landPurchases?: number }).landPurchases;
  },
];

export function deserializeState(data: unknown): GameState {
  const state = decode(data) as GameState;
  rebuildDerived(state);
  for (const upgrade of UPGRADES) upgrade(state);
  return state;
}

function rebuildDerived(state: GameState): void {
  void state; // task 9 regenerates the world from the seed here
}

import type { SimEvent } from './events';
import { createLedger, type Ledger } from './ledger';
import { createRng, deriveSeed, type RngState } from './rng';

export type CompanionId = 'veteran' | 'shipAi' | 'coFounder' | 'pirate';

export interface Company {
  name: string;
  companionId: CompanionId;
}

export interface GameState {
  version: 1;
  seed: number;
  tick: number;
  rng: RngState;
  company: Company | null;
  nextId: number;
  ledger: Ledger;
  /** Events raised by commands, delivered with the next step. */
  pendingEvents: SimEvent[];
}

export function createInitialState(seed: number): GameState {
  return {
    version: 1,
    seed,
    tick: 0,
    rng: createRng(deriveSeed(seed, 'main')).getState(),
    company: null,
    nextId: 1,
    ledger: createLedger(),
    pendingEvents: [],
  };
}

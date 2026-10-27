import type { Command, CommandResult } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import type { Company } from '../sim/state';

export interface DebugFlags {
  timescale: number;
  freeze: boolean;
  seed: number | null;
  scene: 'none' | 'demo' | 'bench';
  noWebgl: boolean;
}

// Later tasks add members to these unions.
export type ToWorker =
  | { t: 'init'; nowMs: number; debug: DebugFlags }
  | { t: 'command'; id: number; cmd: Command }
  | { t: 'saveNow' }
  | { t: 'advanceRealMs'; ms: number };

export interface UiSnapshot {
  tick: number;
  date: string;
  company: Company | null;
}

export type FromWorker =
  | { t: 'ready'; founded: boolean }
  | { t: 'snapshot'; tick: number; anchorRealMs: number; ui: UiSnapshot }
  | { t: 'events'; events: SimEvent[] }
  | { t: 'commandResult'; id: number; result: CommandResult }
  | { t: 'error'; message: string };

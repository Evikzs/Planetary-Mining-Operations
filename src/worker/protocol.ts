import type { GoodId } from '../data/goods';
import type { Command, CommandResult } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import type { AwaySummary } from '../sim/offline';
import type { MotionView, PeopleFilter, PeopleRow, UiSnapshot, WorldView } from '../sim/views';

export type { UiSnapshot } from '../sim/views';

export interface DebugFlags {
  timescale: number;
  freeze: boolean;
  seed: number | null;
  scene: 'none' | 'demo' | 'bench';
  noWebgl: boolean;
}

export type ManualSlot = 1 | 2 | 3 | 4 | 5;

/** A filled manual save slot, as the Settings tab lists it. */
export interface SaveSlot {
  slot: ManualSlot;
  company: string;
  tick: number;
  savedAtRealMs: number;
}

export type ToWorker =
  | { t: 'init'; nowMs: number; debug: DebugFlags }
  | { t: 'command'; id: number; cmd: Command }
  | { t: 'saveNow' }
  | { t: 'advanceRealMs'; ms: number }
  | {
      t: 'queryPeople';
      id: number;
      filter: PeopleFilter;
      offset: number;
      limit: number;
    }
  | { t: 'quote'; id: number; goodId: GoodId; side: 'buy' | 'sell'; kg: number }
  | { t: 'exportSave'; id: number }
  | { t: 'importSave'; id: number; code: string }
  | { t: 'newGame'; seed: number }
  | { t: 'listSaves'; id: number }
  | { t: 'manualSave'; id: number; slot: ManualSlot }
  | { t: 'manualLoad'; id: number; slot: ManualSlot };

export type FromWorker =
  | { t: 'ready'; founded: boolean }
  | { t: 'snapshot'; tick: number; anchorRealMs: number; ui: UiSnapshot }
  | { t: 'world'; world: WorldView }
  | { t: 'motion'; motion: MotionView; anchorRealMs: number }
  | { t: 'events'; events: SimEvent[] }
  | { t: 'commandResult'; id: number; result: CommandResult }
  | { t: 'peoplePage'; id: number; total: number; rows: PeopleRow[] }
  | { t: 'quoteResult'; id: number; priceCents: number; filledKg: number }
  | { t: 'exportResult'; id: number; code: string }
  /** The answer to importSave and manualLoad. */
  | { t: 'loadResult'; id: number; ok: boolean; error?: string }
  /** The filled manual slots, after listSaves or manualSave; error when the save failed. */
  | { t: 'saveSlots'; id: number; slots: SaveSlot[]; error?: string }
  | { t: 'error'; message: string }
  | { t: 'catchUp'; progress: number }
  | { t: 'away'; summary: AwaySummary };

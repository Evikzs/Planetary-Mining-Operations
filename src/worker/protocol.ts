import type { GoodId } from '../data/goods';
import type { Command, CommandResult } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import type { AwaySummary } from '../sim/offline';
import type { MotionView, PeopleFilter, PeopleRow, UiSnapshot, WorldView } from '../sim/views';

export type { UiSnapshot } from '../sim/views';

/** Test scenes for dev and e2e builds; the rival bench has six companies. */
export type Scene = 'demo' | 'bench' | 'rivalBench';

export interface DebugFlags {
  timescale: number;
  freeze: boolean;
  seed: number | null;
  scene: 'none' | Scene;
  noWebgl: boolean;
}

export type ManualSlot = 1 | 2 | 3 | 4 | 5;

export type Speed = 1 | 2 | 4 | 8;

/**
 * The clock as the player sees it. `rate` is game minutes per real second (0 while paused);
 * `actualSpeed` is the speed the machine kept up over the last 2 real seconds.
 */
export interface ClockState {
  paused: boolean;
  speed: Speed;
  rate: number;
  actualSpeed: number;
}

/** Player choices the worker needs. */
export interface Prefs {
  offlineCatchUp: boolean;
}

/** A filled manual save slot, as the Settings tab lists it. */
export interface SaveSlot {
  slot: ManualSlot;
  company: string;
  tick: number;
  savedAtRealMs: number;
}

export type ToWorker =
  /** `prefs` defaults to offline catch-up on; `fileSaves` when the desktop app keeps the saves. */
  | { t: 'init'; nowMs: number; debug: DebugFlags; prefs?: Prefs; fileSaves?: boolean }
  /** The page's answer to a storeCall. */
  | { t: 'storeResult'; id: number; ok: boolean; value?: unknown; error?: string }
  | { t: 'command'; id: number; cmd: Command }
  /** With an id, the worker answers `saved` once the write is over. */
  | { t: 'saveNow'; id?: number }
  | { t: 'advanceRealMs'; ms: number }
  | { t: 'setClock'; paused: boolean; speed: Speed }
  | { t: 'setPrefs'; prefs: Prefs }
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
  | { t: 'snapshot'; tick: number; anchorRealMs: number; clock: ClockState; ui: UiSnapshot }
  | { t: 'world'; world: WorldView }
  | { t: 'motion'; motion: MotionView; anchorRealMs: number; clock: ClockState }
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
  | { t: 'saved'; id: number }
  /** The desktop app's save files live behind the page: the worker asks it. */
  | { t: 'storeCall'; id: number; op: 'list' | 'read' | 'write'; slot?: string; text?: string }
  | { t: 'away'; summary: AwaySummary };

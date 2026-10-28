import type { Skill } from '../data/buildings';
import type { GoodId } from '../data/goods';
import type { Command, CommandResult } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import type { AwaySummary } from '../sim/offline';
import type { MoraleBand, MotionView, PeopleRow, UiSnapshot, WorldView } from '../sim/views';

export type { UiSnapshot } from '../sim/views';

export interface DebugFlags {
  timescale: number;
  freeze: boolean;
  seed: number | null;
  scene: 'none' | 'demo' | 'bench';
  noWebgl: boolean;
}

export type ManualSlot = 1 | 2 | 3 | 4 | 5;

export type ToWorker =
  | { t: 'init'; nowMs: number; debug: DebugFlags }
  | { t: 'command'; id: number; cmd: Command }
  | { t: 'saveNow' }
  | { t: 'advanceRealMs'; ms: number }
  | {
      t: 'queryPeople';
      id: number;
      filter: { sectionId?: number; skill?: Skill; morale?: MoraleBand };
      offset: number;
      limit: number;
    }
  | { t: 'quote'; id: number; goodId: GoodId; side: 'buy' | 'sell'; kg: number }
  | { t: 'exportSave'; id: number }
  | { t: 'importSave'; id: number; code: string }
  | { t: 'newGame'; seed: number }
  | { t: 'manualSave'; slot: ManualSlot }
  | { t: 'manualLoad'; slot: ManualSlot };

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
  | { t: 'importResult'; id: number; ok: boolean; error?: string }
  | { t: 'error'; message: string }
  | { t: 'catchUp'; progress: number }
  | { t: 'away'; summary: AwaySummary };

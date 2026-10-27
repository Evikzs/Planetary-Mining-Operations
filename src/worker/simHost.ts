import { formatGameDate } from '../sim/clock';
import { applyCommand, createGame, step } from '../sim/engine';
import type { SimEvent } from '../sim/events';
import type { GameState } from '../sim/state';
import type { SaveFile, SaveStore } from '../save/types';
import type { DebugFlags, FromWorker, ToWorker, UiSnapshot } from './protocol';

export interface SaveCodec {
  encode(state: GameState, savedAtRealMs: number): SaveFile;
  decode(file: SaveFile): { state: GameState; savedAtRealMs: number } | null;
}

export interface SimHostDeps {
  post(msg: FromWorker, transfer?: Transferable[]): void;
  now(): number;
  saves: SaveStore;
  codec: SaveCodec;
}

/** Gaps longer than this many ticks go through catch-up instead of fine ticks. */
export const FINE_CATCH_UP_LIMIT = 300;
const PUMP_BUDGET_MS = 50;
const AUTOSAVE_MS = 30_000;

const DEFAULT_FLAGS: DebugFlags = {
  timescale: 1,
  freeze: false,
  seed: null,
  scene: 'none',
  noWebgl: false,
};

export class SimHost {
  private state: GameState = createGame(0);
  private flags: DebugFlags = DEFAULT_FLAGS;
  private offsetMs = 0;
  private anchorTick = 0;
  private anchorRealMs = 0;
  private lastSaveMs = 0;

  constructor(private readonly deps: SimHostDeps) {}

  private now(): number {
    return this.deps.now() + this.offsetMs;
  }

  async handle(msg: ToWorker): Promise<void> {
    switch (msg.t) {
      case 'init':
        await this.init(msg.nowMs, msg.debug);
        return;
      case 'command': {
        const result = applyCommand(this.state, msg.cmd);
        if (result.ok && msg.cmd.t === 'foundCompany') this.reanchor();
        this.deps.post({ t: 'commandResult', id: msg.id, result });
        this.postSnapshot();
        return;
      }
      case 'saveNow':
        await this.save();
        return;
      case 'advanceRealMs':
        this.offsetMs += msg.ms;
        return;
    }
  }

  private async init(nowMs: number, debug: DebugFlags): Promise<void> {
    this.flags = debug;
    const file = await this.deps.saves.loadLatestValid();
    const loaded = file ? this.deps.codec.decode(file) : null;
    if (loaded) {
      this.state = loaded.state;
      this.reanchor();
      if (this.state.company) this.catchUp(this.ticksFor(this.now() - loaded.savedAtRealMs));
    } else {
      this.state = createGame(debug.seed ?? nowMs >>> 0);
      this.reanchor();
    }
    this.lastSaveMs = this.now();
    this.deps.post({ t: 'ready', founded: this.state.company !== null });
    this.postSnapshot();
  }

  pump(): void {
    if (!this.state.company || this.flags.freeze) return;
    const start = this.now();
    const target = this.anchorTick + this.ticksFor(start - this.anchorRealMs);
    let due = target - this.state.tick;
    if (due <= 0) return this.maybeAutosave();
    const events: SimEvent[] = [];
    if (due > FINE_CATCH_UP_LIMIT) {
      events.push(...this.catchUp(due));
    } else {
      while (due > 0 && this.now() - start < PUMP_BUDGET_MS) {
        events.push(...step(this.state, { mode: 'fine' }));
        due--;
      }
    }
    if (events.length) this.deps.post({ t: 'events', events });
    this.postSnapshot();
    this.maybeAutosave();
  }

  /** M0 catch-up: fine ticks to the hour, coarse hours, then fine ticks; re-anchors the clock. */
  private catchUp(ticks: number): SimEvent[] {
    const events: SimEvent[] = [];
    let left = Math.max(0, ticks);
    while (left > 0 && this.state.tick % 60 !== 0) {
      events.push(...step(this.state, { mode: 'fine' }));
      left--;
    }
    while (left >= 60) {
      events.push(...step(this.state, { mode: 'coarse' }));
      left -= 60;
    }
    while (left > 0) {
      events.push(...step(this.state, { mode: 'fine' }));
      left--;
    }
    this.reanchor();
    return events;
  }

  private ticksFor(realMs: number): number {
    return Math.floor((Math.max(0, realMs) * this.flags.timescale) / 1000);
  }

  private reanchor(): void {
    this.anchorTick = this.state.tick;
    this.anchorRealMs = this.now();
  }

  private maybeAutosave(): void {
    if (this.now() - this.lastSaveMs >= AUTOSAVE_MS) void this.save();
  }

  private async save(): Promise<void> {
    if (!this.state.company) return;
    this.lastSaveMs = this.now();
    try {
      await this.deps.saves.writeAuto(this.deps.codec.encode(this.state, this.lastSaveMs));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.deps.post({ t: 'error', message: `Could not save the game: ${reason}` });
    }
  }

  private postSnapshot(): void {
    const ui: UiSnapshot = {
      tick: this.state.tick,
      date: formatGameDate(this.state.tick),
      company: this.state.company,
    };
    const anchorRealMs =
      this.anchorRealMs + ((this.state.tick - this.anchorTick) * 1000) / this.flags.timescale;
    this.deps.post({ t: 'snapshot', tick: this.state.tick, anchorRealMs, ui });
  }
}

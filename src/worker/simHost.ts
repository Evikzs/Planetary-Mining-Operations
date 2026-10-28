import { OFFLINE } from '../data/balance';
import { applyCommand, createGame, step } from '../sim/engine';
import type { SimEvent } from '../sim/events';
import { quote } from '../sim/market/market';
import { runCatchUp } from '../sim/offline';
import type { GameState } from '../sim/state';
import { unlockCodex } from '../sim/story/codex';
import {
  buildMotionView,
  buildUiSnapshot,
  buildWorldView,
  queryPeople,
  worldSignature,
} from '../sim/views';
import type { SaveFile, SaveStore } from '../save/types';
import type { DebugFlags, FromWorker, ToWorker } from './protocol';

export interface SaveCodec {
  encode(state: GameState, savedAtRealMs: number): SaveFile;
  decode(file: SaveFile): { state: GameState; savedAtRealMs: number } | null;
  /** A save as a 'PMO1.' code the player can copy. */
  exportCode(file: SaveFile): Promise<string>;
  importCode(code: string): Promise<SaveFile | null>;
}

export interface SimHostDeps {
  post(msg: FromWorker, transfer?: Transferable[]): void;
  now(): number;
  saves: SaveStore;
  codec: SaveCodec;
  /** Dev builds pass checkInvariants; violations are posted as errors. */
  checkInvariants?: (state: GameState) => string[];
  /** Dev and e2e builds pass the demo and bench scene builders. */
  loadScene?: (scene: 'demo' | 'bench', seed: number) => Promise<GameState>;
}

/** Gaps longer than this many ticks go through catch-up instead of fine ticks. */
export const FINE_CATCH_UP_LIMIT = OFFLINE.fineThresholdTicks;
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
  private worldVersion = 0;
  private worldSig = '';

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
        this.postViews(false);
        return;
      }
      case 'saveNow':
        await this.save();
        return;
      case 'advanceRealMs':
        this.offsetMs += msg.ms;
        return;
      case 'queryPeople': {
        const page = queryPeople(this.state, msg.filter, msg.offset, msg.limit);
        this.deps.post({ t: 'peoplePage', id: msg.id, ...page });
        return;
      }
      case 'quote':
        unlockCodex(this.state, `good.${msg.goodId}`);
        this.deps.post({
          t: 'quoteResult',
          id: msg.id,
          ...quote(this.state, msg.goodId, msg.side, msg.kg),
        });
        return;
      case 'exportSave': {
        const code = await this.deps.codec.exportCode(
          this.deps.codec.encode(this.state, this.now()),
        );
        this.deps.post({ t: 'exportResult', id: msg.id, code });
        return;
      }
      case 'importSave': {
        const file = await this.deps.codec.importCode(msg.code);
        const loaded = file ? this.deps.codec.decode(file) : null;
        if (!loaded) {
          this.deps.post({
            t: 'importResult',
            id: msg.id,
            ok: false,
            error: 'That code is not a valid save.',
          });
          return;
        }
        this.deps.post({ t: 'importResult', id: msg.id, ok: true });
        this.replaceState(loaded.state);
        await this.save();
        return;
      }
      case 'newGame':
        this.replaceState(createGame(msg.seed >>> 0));
        // Saved at once, so a reload does not bring the old company back.
        await this.save(true);
        return;
      case 'manualSave':
        try {
          if (!this.deps.saves.writeManual) throw new Error('this browser cannot keep save slots');
          await this.deps.saves.writeManual(
            msg.slot,
            this.deps.codec.encode(this.state, this.now()),
          );
        } catch (err) {
          this.reportSaveError(err);
        }
        return;
      case 'manualLoad': {
        const file = await this.deps.saves.readManual?.(msg.slot);
        const loaded = file ? this.deps.codec.decode(file) : null;
        if (!file || !loaded) {
          const message = file ? 'That save could not be read.' : 'That save slot is empty.';
          this.deps.post({ t: 'error', message });
          return;
        }
        this.replaceState(loaded.state);
        await this.save();
        return;
      }
    }
  }

  private async init(nowMs: number, debug: DebugFlags): Promise<void> {
    this.flags = debug;
    const seed = debug.seed ?? nowMs >>> 0;
    const file = await this.deps.saves.loadLatestValid();
    const loaded = file ? this.deps.codec.decode(file) : null;
    if (debug.scene !== 'none' && this.deps.loadScene) {
      this.state = await this.deps.loadScene(debug.scene, seed);
      this.reanchor();
    } else if (loaded) {
      this.state = loaded.state;
      this.reanchor();
      if (this.state.company) this.catchUp(this.now() - loaded.savedAtRealMs);
    } else {
      this.state = createGame(seed);
      this.reanchor();
    }
    this.lastSaveMs = this.now();
    this.deps.post({ t: 'ready', founded: this.state.company !== null });
    this.postViews(true);
  }

  private replaceState(state: GameState): void {
    this.state = state;
    this.reanchor();
    this.worldSig = '';
    this.deps.post({ t: 'ready', founded: state.company !== null });
    this.postViews(true);
  }

  pump(): void {
    if (!this.state.company || this.flags.freeze) return;
    const start = this.now();
    const target = this.anchorTick + this.ticksFor(start - this.anchorRealMs);
    let due = target - this.state.tick;
    if (due <= 0) return this.maybeAutosave();
    const events: SimEvent[] = [];
    if (due > FINE_CATCH_UP_LIMIT) {
      this.catchUp(start - this.realMsOfTick());
    } else {
      while (due > 0 && this.now() - start < PUMP_BUDGET_MS) {
        events.push(...step(this.state, { mode: 'fine' }));
        due--;
      }
    }
    if (events.length) this.deps.post({ t: 'events', events });
    for (const problem of this.deps.checkInvariants?.(this.state) ?? []) {
      this.deps.post({ t: 'error', message: `Invariant: ${problem}` });
    }
    this.postViews(true);
    this.maybeAutosave();
  }

  /** Runs the time away under offline rules, then re-anchors the clock to now. */
  private catchUp(realMsAway: number): void {
    const summary = runCatchUp(this.state, realMsAway, this.flags.timescale, (progress) =>
      this.deps.post({ t: 'catchUp', progress }),
    );
    this.reanchor();
    if (summary.gameHours >= OFFLINE.awayScreenMinHours) this.deps.post({ t: 'away', summary });
  }

  /** The real time at which the current tick was due. */
  private realMsOfTick(): number {
    return this.anchorRealMs + ((this.state.tick - this.anchorTick) * 1000) / this.flags.timescale;
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

  private async save(evenUnfounded = false): Promise<void> {
    if (!this.state.company && !evenUnfounded) return;
    this.lastSaveMs = this.now();
    try {
      await this.deps.saves.writeAuto(this.deps.codec.encode(this.state, this.lastSaveMs));
    } catch (err) {
      this.reportSaveError(err);
    }
  }

  private reportSaveError(err: unknown): void {
    const reason = err instanceof Error ? err.message : String(err);
    this.deps.post({ t: 'error', message: `Could not save the game: ${reason}` });
  }

  /** The world when it changed, what moves when time moved, and always the UI snapshot. */
  private postViews(withMotion: boolean): void {
    const signature = worldSignature(this.state);
    if (signature !== this.worldSig) {
      this.worldSig = signature;
      this.deps.post({ t: 'world', world: buildWorldView(this.state, ++this.worldVersion) });
    }
    const anchorRealMs = this.realMsOfTick();
    if (withMotion) {
      this.deps.post({ t: 'motion', motion: buildMotionView(this.state), anchorRealMs });
    }
    const ui = buildUiSnapshot(this.state);
    this.deps.post({ t: 'snapshot', tick: this.state.tick, anchorRealMs, ui });
  }
}

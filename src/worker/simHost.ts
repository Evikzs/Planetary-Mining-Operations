import { OFFLINE } from '../data/balance';
import { applyCommand, createGame, step } from '../sim/engine';
import type { SimEvent } from '../sim/events';
import { quote } from '../sim/market/market';
import { runCatchUp } from '../sim/offline';
import type { GameState } from '../sim/state';
import { unlockCodex } from '../sim/story/codex';
import { usableSeed } from '../sim/world/luna';
import {
  buildMotionView,
  buildUiSnapshot,
  buildWorldView,
  queryPeople,
  worldSignature,
} from '../sim/views';
import { createMemorySaveStore } from '../save/memoryStore';
import type { SaveFile, SaveStore } from '../save/types';
import type { DebugFlags, FromWorker, ManualSlot, SaveSlot, ToWorker } from './protocol';

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

/**
 * Whether a loaded state can run: its views build and a copy takes one step. The checksum only
 * proves a save is whole, not that its inner data fits this version of the game.
 */
function usable(state: GameState): boolean {
  try {
    const copy = structuredClone(state);
    buildWorldView(copy, 0);
    buildUiSnapshot(copy);
    buildMotionView(copy);
    step(copy, { mode: 'fine' });
    return true;
  } catch {
    return false;
  }
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const saveErrorText = (err: unknown): string => `Could not save the game: ${reason(err)}`;

export class SimHost {
  private state: GameState = createGame(0);
  private flags: DebugFlags = DEFAULT_FLAGS;
  private offsetMs = 0;
  private anchorTick = 0;
  private anchorRealMs = 0;
  private lastSaveMs = 0;
  private worldVersion = 0;
  private worldSig = '';
  private saves: SaveStore;
  /** Set when a step threw: the clock stops and nothing more is saved over the last good save. */
  private halted = false;

  constructor(private readonly deps: SimHostDeps) {
    this.saves = deps.saves;
  }

  private now(): number {
    return this.deps.now() + this.offsetMs;
  }

  /** Answers one message; a failure becomes an error message rather than a silent stop. */
  async handle(msg: ToWorker): Promise<void> {
    try {
      await this.dispatch(msg);
    } catch (err) {
      this.deps.post({ t: 'error', message: `Something went wrong: ${reason(err)}` });
    }
  }

  private async dispatch(msg: ToWorker): Promise<void> {
    switch (msg.t) {
      case 'init':
        await this.init(msg.nowMs, msg.debug);
        return;
      case 'command': {
        const result = applyCommand(this.state, msg.cmd);
        const founded = result.ok && msg.cmd.t === 'foundCompany';
        if (founded) this.reanchor();
        this.deps.post({ t: 'commandResult', id: msg.id, result });
        this.postViews(false);
        // Each action is saved at once: the save on leaving the page is not sure to finish.
        if (result.ok) await this.save();
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
        if (!loaded || !usable(loaded.state)) {
          this.deps.post({
            t: 'loadResult',
            id: msg.id,
            ok: false,
            error: 'That code is not a valid save.',
          });
          return;
        }
        this.deps.post({ t: 'loadResult', id: msg.id, ok: true });
        this.replaceState(loaded.state);
        await this.save();
        return;
      }
      case 'newGame':
        this.replaceState(createGame(usableSeed(msg.seed)));
        // Saved at once, so a reload does not bring the old company back.
        await this.save(true);
        return;
      case 'listSaves':
        this.deps.post({ t: 'saveSlots', id: msg.id, slots: await this.manualSlots() });
        return;
      case 'manualSave': {
        let error: string | undefined;
        try {
          if (!this.saves.writeManual) throw new Error('this browser cannot keep save slots');
          await this.saves.writeManual(msg.slot, this.deps.codec.encode(this.state, this.now()));
        } catch (err) {
          error = saveErrorText(err);
        }
        const slots = await this.manualSlots();
        this.deps.post({ t: 'saveSlots', id: msg.id, slots, ...(error ? { error } : {}) });
        return;
      }
      case 'manualLoad': {
        const file = await this.saves.readManual?.(msg.slot);
        const loaded = file ? this.deps.codec.decode(file) : null;
        if (!file || !loaded || !usable(loaded.state)) {
          const error = file ? 'That save could not be read.' : 'That save slot is empty.';
          this.deps.post({ t: 'loadResult', id: msg.id, ok: false, error });
          return;
        }
        this.deps.post({ t: 'loadResult', id: msg.id, ok: true });
        this.replaceState(loaded.state);
        await this.save();
        return;
      }
    }
  }

  private async init(nowMs: number, debug: DebugFlags): Promise<void> {
    this.flags = debug;
    const seed = debug.seed ?? nowMs >>> 0;
    let file: SaveFile | null = null;
    try {
      file = await this.saves.loadLatestValid((f) => {
        const d = this.deps.codec.decode(f);
        return !!d && usable(d.state);
      });
    } catch (err) {
      // IndexedDB can exist and still refuse to open, as when a browser blocks site data.
      this.saves = createMemorySaveStore();
      this.deps.post({
        t: 'error',
        message: `This browser does not let the game keep saves (${reason(err)}). You can play, but progress ends when the page closes.`,
      });
    }
    const loaded = file ? this.deps.codec.decode(file) : null;
    if (debug.scene !== 'none' && this.deps.loadScene) {
      this.state = await this.deps.loadScene(debug.scene, usableSeed(seed));
      this.reanchor();
    } else if (loaded) {
      this.state = loaded.state;
      this.reanchor();
      if (this.state.company) this.catchUp(this.now() - loaded.savedAtRealMs);
    } else {
      this.state = createGame(usableSeed(seed));
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
    if (this.halted) return;
    try {
      this.advance();
    } catch (err) {
      this.halted = true;
      this.deps.post({
        t: 'error',
        message: `The game stopped: ${reason(err)}. Reload the page to go on from your last save.`,
      });
    }
  }

  private advance(): void {
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
    if (this.halted || (!this.state.company && !evenUnfounded)) return;
    this.lastSaveMs = this.now();
    try {
      await this.saves.writeAuto(this.deps.codec.encode(this.state, this.lastSaveMs));
    } catch (err) {
      this.reportSaveError(err);
    }
  }

  private reportSaveError(err: unknown): void {
    this.deps.post({ t: 'error', message: saveErrorText(err) });
  }

  private async manualSlots(): Promise<SaveSlot[]> {
    const all = (await this.saves.list?.()) ?? [];
    return all.flatMap((s) => {
      const n = /^manual-([1-5])$/.exec(s.slot)?.[1];
      if (!n) return [];
      const { company, tick, savedAtRealMs } = s;
      return [{ slot: Number(n) as ManualSlot, company, tick, savedAtRealMs }];
    });
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

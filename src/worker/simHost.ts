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
import type {
  ClockState,
  DebugFlags,
  FromWorker,
  ManualSlot,
  Prefs,
  SaveSlot,
  Scene,
  Speed,
  ToWorker,
} from './protocol';
import { playerCompany } from '../sim/companies';

export interface SaveCodec {
  encode(state: GameState, savedAtRealMs: number, paused: boolean): SaveFile;
  decode(file: SaveFile): { state: GameState; savedAtRealMs: number; paused: boolean } | null;
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
  loadScene?: (scene: Scene, seed: number) => Promise<GameState>;
}

/** Gaps longer than this many ticks go through catch-up instead of fine ticks. */
export const FINE_CATCH_UP_LIMIT = OFFLINE.fineThresholdTicks;
const PUMP_BUDGET_MS = 50;
const AUTOSAVE_MS = 30_000;
/** No pump for this long means the machine slept or the worker stalled: a gap, not a backlog. */
const GAP_MS = 5_000;
/** The real-speed readout averages over this window. */
const SPEED_WINDOW_MS = 2_000;

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
  private paused = false;
  private speed: Speed = 1;
  private prefs: Prefs = { offlineCatchUp: true };
  private lastPumpMs = 0;
  private windowStartMs = 0;
  private windowTicks = 0;
  private actualSpeed = 1;

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
        await this.init(msg.nowMs, msg.debug, msg.prefs);
        return;
      case 'command': {
        const result = applyCommand(this.state, msg.cmd);
        const founded = result.ok && msg.cmd.t === 'foundCompany';
        // A new company starts its clock running at 1x (tests may hold it with ?freeze=1).
        if (founded) this.setClock(this.flags.freeze, 1);
        this.deps.post({ t: 'commandResult', id: msg.id, result });
        this.postViews(false);
        // Each action is saved at once: the save on leaving the page is not sure to finish.
        if (result.ok) await this.save();
        return;
      }
      case 'saveNow':
        await this.save();
        if (msg.id !== undefined) this.deps.post({ t: 'saved', id: msg.id });
        return;
      case 'advanceRealMs':
        this.offsetMs += msg.ms;
        return;
      case 'setClock':
        this.setClock(msg.paused, msg.speed);
        // A save records how the clock stands: a reload must not count paused time as time away.
        await this.save();
        this.postViews(false);
        return;
      case 'setPrefs':
        this.prefs = msg.prefs;
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
          this.deps.codec.encode(this.state, this.now(), this.paused),
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
        this.paused = true;
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
          await this.saves.writeManual(
            msg.slot,
            this.deps.codec.encode(this.state, this.now(), this.paused),
          );
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
        this.paused = true;
        this.replaceState(loaded.state);
        await this.save();
        return;
      }
    }
  }

  private async init(nowMs: number, debug: DebugFlags, prefs?: Prefs): Promise<void> {
    this.flags = debug;
    if (prefs) this.prefs = prefs;
    this.paused = debug.freeze;
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
      const ranWhileClosed = this.prefs.offlineCatchUp && !loaded.paused;
      if (playerCompany(this.state) && ranWhileClosed) {
        this.catchUp(this.now() - loaded.savedAtRealMs);
      }
      // A loaded game waits for the player.
      this.paused = true;
    } else {
      this.state = createGame(usableSeed(seed));
      this.reanchor();
    }
    this.lastSaveMs = this.now();
    this.resetSpeedWindow();
    this.deps.post({ t: 'ready', founded: playerCompany(this.state) !== undefined });
    this.postViews(true);
  }

  private replaceState(state: GameState): void {
    this.state = state;
    this.reanchor();
    this.worldSig = '';
    this.deps.post({ t: 'ready', founded: playerCompany(state) !== undefined });
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
    if (!playerCompany(this.state) || this.paused) return;
    const start = this.now();
    const sincePump = start - this.lastPumpMs;
    this.lastPumpMs = start;
    const target = this.anchorTick + this.ticksFor(start - this.anchorRealMs);
    let due = target - this.state.tick;
    if (due <= 0) return this.maybeAutosave();
    const events: SimEvent[] = [];
    const before = this.state.tick;
    if (due > FINE_CATCH_UP_LIMIT && sincePump > GAP_MS) {
      // The machine slept or the worker stalled: time away, if the player wants it to count.
      if (this.prefs.offlineCatchUp) this.catchUp(start - this.realMsOfTick());
      else this.reanchor();
    } else {
      while (due > 0 && this.now() - start < PUMP_BUDGET_MS) {
        events.push(...step(this.state, { mode: 'fine' }));
        due--;
      }
      // Too slow for this speed: drop the backlog rather than run it under offline rules.
      if (due > FINE_CATCH_UP_LIMIT) this.reanchor();
      this.measure(start, this.state.tick - before);
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

  /** Game minutes per real second while running. */
  private runRate(): number {
    return this.flags.timescale * this.speed;
  }

  private clock(): ClockState {
    return {
      paused: this.paused,
      speed: this.speed,
      rate: this.paused ? 0 : this.runRate(),
      actualSpeed: this.paused ? 0 : this.actualSpeed,
    };
  }

  private setClock(paused: boolean, speed: Speed): void {
    // The time so far runs at the old rate; the new rate counts from now.
    this.reanchor();
    this.paused = paused;
    this.speed = speed;
    this.resetSpeedWindow();
  }

  private resetSpeedWindow(): void {
    this.actualSpeed = this.speed;
    this.windowStartMs = this.now();
    this.windowTicks = 0;
  }

  /** Ticks run against real time, over windows of SPEED_WINDOW_MS. */
  private measure(at: number, ticks: number): void {
    this.windowTicks += ticks;
    const span = at - this.windowStartMs;
    if (span < SPEED_WINDOW_MS) return;
    this.actualSpeed =
      Math.round(((this.windowTicks * 1000) / span / this.flags.timescale) * 10) / 10;
    this.windowStartMs = at;
    this.windowTicks = 0;
  }

  /** The real time at which the current tick was due. */
  private realMsOfTick(): number {
    return this.anchorRealMs + ((this.state.tick - this.anchorTick) * 1000) / this.runRate();
  }

  private ticksFor(realMs: number): number {
    return Math.floor((Math.max(0, realMs) * this.runRate()) / 1000);
  }

  private reanchor(): void {
    this.anchorTick = this.state.tick;
    this.anchorRealMs = this.now();
    this.lastPumpMs = this.anchorRealMs;
  }

  private maybeAutosave(): void {
    if (this.now() - this.lastSaveMs >= AUTOSAVE_MS) void this.save();
  }

  private async save(evenUnfounded = false): Promise<void> {
    if (this.halted || (!playerCompany(this.state) && !evenUnfounded)) return;
    this.lastSaveMs = this.now();
    try {
      await this.saves.writeAuto(this.deps.codec.encode(this.state, this.lastSaveMs, this.paused));
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
    const clock = this.clock();
    if (withMotion) {
      this.deps.post({ t: 'motion', motion: buildMotionView(this.state), anchorRealMs, clock });
    }
    const ui = buildUiSnapshot(this.state);
    this.deps.post({ t: 'snapshot', tick: this.state.tick, anchorRealMs, clock, ui });
  }
}

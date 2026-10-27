import { BUILDINGS, type BuildingTypeId } from '../../data/buildings';
import { landPrice } from '../build/landOffice';
import { fail, OK, type CommandResult } from '../commands';
import type { System } from '../engine';
import type { SimEvent } from '../events';
import { balance } from '../ledger';
import type { GameState } from '../state';
import { BEATS, TUTORIAL, type BeatId, type HintCategory } from './beats';
import { unlockCodex, unlockFromState } from './codex';

export interface StoryState {
  /** Every beat that has started, in order. */
  seen: BeatId[];
  done: BeatId[];
  /** Beats waiting to be shown, first one on screen. */
  queue: BeatId[];
  muted: HintCategory[];
  /** Unlocked Codex entries, in the order they opened. */
  codex: string[];
  cameraTaught: { panned: boolean; zoomed: boolean };
  /** When each event beat last fired, for its 6-hour rest. */
  lastAt: Partial<Record<BeatId, number>>;
}

export function createStory(): StoryState {
  return {
    seen: [],
    done: [],
    queue: [],
    muted: [],
    codex: [],
    cameraTaught: { panned: false, zoomed: false },
    lastAt: {},
  };
}

const COMPANION_NAME = 'Ox Varga';
const EVENT_REST_MINUTES = 6 * 60;
const RIGS: BuildingTypeId[] = ['mine', 'iceDrill', 'regolithScoop'];
const SHORTAGE_BEATS = {
  air: 'ev.shortageAir',
  water: 'ev.shortageWater',
  food: 'ev.shortageFood',
} as const;

/** Tutorial beats that wait for more than the previous beat. */
const TRIGGER: Partial<Record<BeatId, (s: GameState, events: SimEvent[]) => boolean>> = {
  'ch1.belts': (s) =>
    s.buildings.some((b) => BUILDINGS[b.type].belt && b.status !== 'constructing'),
  'ch1.shiftChange': (_s, events) => events.some((e) => e.t === 'shiftChange'),
  'ch1.expansion': (s) => balance(s.ledger, 'player') >= landPrice(s.landPurchases),
};

/** Beats that end when something happens rather than when the player closes them. */
const COMPLETE: Partial<Record<BeatId, (s: GameState) => boolean>> = {
  'ch1.camera': (s) => s.story.cameraTaught.panned && s.story.cameraTaught.zoomed,
  'ch1.firstMine': (s) => s.buildings.some((b) => RIGS.includes(b.type)),
  'ch1.firstSale': (s) => Object.values(s.stats.soldKg).some((kg) => (kg ?? 0) > 0),
  'ch1.firstContract': (s) => s.contracts.some((c) => c.status === 'completed'),
  'ch1.firstRefinery': (s) => (s.stats.producedKg.steel ?? 0) > 0,
  'ch1.expansion': (s) => s.landPurchases > 0,
};

function finish(state: GameState, beat: BeatId): void {
  const story = state.story;
  story.queue = story.queue.filter((b) => b !== beat);
  if (!story.done.includes(beat)) story.done.push(beat);
  for (const id of BEATS[beat].codex) unlockCodex(state, id);
}

function begin(state: GameState, beat: BeatId, first = false): void {
  const story = state.story;
  const def = BEATS[beat];
  if (!story.seen.includes(beat)) story.seen.push(beat);
  if (def.ack) for (const id of def.codex) unlockCodex(state, id);
  if (story.muted.includes(def.category)) {
    if (def.ack) finish(state, beat);
    return;
  }
  if (story.queue.includes(beat)) return;
  if (first) story.queue.unshift(beat);
  else story.queue.push(beat);
}

function fireEventBeat(state: GameState, beat: BeatId): void {
  const last = state.story.lastAt[beat];
  if (last !== undefined && state.tick - last < EVENT_REST_MINUTES) return;
  state.story.lastAt[beat] = state.tick;
  begin(state, beat);
}

function onEvent(state: GameState, e: SimEvent): void {
  const seen = state.story.seen;
  switch (e.t) {
    case 'brownout':
      if (seen.includes('ch1.power')) fireEventBeat(state, 'ev.brownout');
      else begin(state, 'ch1.power', true);
      break;
    case 'shortage':
      if (seen.includes('ch1.lifeSupport')) fireEventBeat(state, SHORTAGE_BEATS[e.need]);
      else begin(state, 'ch1.lifeSupport');
      break;
    case 'strike':
      fireEventBeat(state, 'ev.strike');
      break;
    case 'emigration':
      fireEventBeat(state, 'ev.emigration');
      break;
    case 'contractFailed':
      fireEventBeat(state, 'ev.contractFailed');
      break;
    case 'priceMove':
      if (e.pct24h < -0.3) fireEventBeat(state, 'ev.priceCrash');
      break;
  }
}

function progressTutorial(state: GameState, events: SimEvent[]): void {
  const story = state.story;
  for (const beat of [...story.seen]) {
    const isDone = COMPLETE[beat];
    if (isDone && !story.done.includes(beat) && isDone(state)) finish(state, beat);
  }
  const i = TUTORIAL.findIndex((b) => !story.seen.includes(b));
  if (i < 0 || (i > 0 && !story.done.includes(TUTORIAL[i - 1]!))) return;
  const next = TUTORIAL[i]!;
  const trigger = TRIGGER[next];
  if (!trigger || trigger(state, events)) begin(state, next);
}

/** The companion speaks first when the charter is granted. */
export function startStory(state: GameState): void {
  begin(state, 'ch1.founding');
  unlockFromState(state);
}

/** What the companion says now, or the narrator where the companion has no lines. */
export function currentLine(
  state: GameState,
  lines: Record<BeatId, string[]>,
  narrator: Record<BeatId, string[]>,
): { beatId: BeatId; speaker: string; lines: string[] } | null {
  const beatId = state.story.queue[0];
  if (!beatId) return null;
  const own = lines[beatId];
  return own.length
    ? { beatId, speaker: COMPANION_NAME, lines: own }
    : { beatId, speaker: 'Narrator', lines: narrator[beatId] };
}

/** Closes the beat on screen. A beat that waits for an action stays open, just out of sight. */
export function storyAck(state: GameState, beatId: BeatId): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  if (!state.story.queue.includes(beatId)) return OK;
  if (BEATS[beatId].ack) finish(state, beatId);
  else state.story.queue = state.story.queue.filter((b) => b !== beatId);
  return OK;
}

export function setHintMute(
  state: GameState,
  category: HintCategory,
  muted: boolean,
): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const story = state.story;
  story.muted = story.muted.filter((c) => c !== category);
  if (!muted) return OK;
  story.muted.push(category);
  for (const beat of [...story.queue]) {
    if (BEATS[beat].category !== category) continue;
    if (BEATS[beat].ack) finish(state, beat);
    else story.queue = story.queue.filter((b) => b !== beat);
  }
  return OK;
}

export function cameraTaught(state: GameState, panned = false, zoomed = false): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const taught = state.story.cameraTaught;
  taught.panned ||= panned;
  taught.zoomed ||= zoomed;
  return OK;
}

export const storySystem: System = {
  id: 'story',
  step(state, ctx) {
    if (!state.company) return;
    for (const e of ctx.events) onEvent(state, e);
    progressTutorial(state, ctx.events);
    if (state.tick % 60 === 0) unlockFromState(state);
  },
};

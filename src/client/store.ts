import { computed, signal } from '@preact/signals';
import type { GoodId } from '../data/goods';
import { DEFAULT_FILTER, type MapFilter } from '../render/overlays/filters';
import type { GameRenderer, MapPick } from '../render/renderer';
import type { SimEvent } from '../sim/events';
import type { AwaySummary } from '../sim/offline';
import type { SimClient } from './simClient';
import type { MotionView, UiSnapshot, WorldView } from '../sim/views';

export const ui = signal<UiSnapshot | null>(null);
export const world = signal<WorldView | null>(null);
export const motion = signal<{ view: MotionView; anchorRealMs: number } | null>(null);
export const away = signal<AwaySummary | null>(null);
/** 0..1 while the game catches up on time away; null otherwise. */
export const catchUpProgress = signal<number | null>(null);
export const gameRenderer = signal<GameRenderer | null>(null);
export const simClient = signal<SimClient | null>(null);
/** What the compass shows: radians clockwise from north, and whether north is locked. */
export const compass = signal({ heading: 0, lockNorth: true });
export const mapFilter = signal<MapFilter>(DEFAULT_FILTER);
/** Planetary filters show from altitude 30 up; local filters below. */
export const mapLevel = signal<'planetary' | 'local'>('planetary');
/** What the player last tapped on the map. */
export const selection = signal<MapPick | null>(null);
/** Goods whose stock the top bar shows, for the selected section or else the founding one. */
export const pinnedGoods = signal<GoodId[]>([
  'oxygen',
  'potableWater',
  'hydroponicProduce',
  'ilmenite',
  'steel',
]);
/** The latest problem the game worker reported, until the player dismisses it. */
export const workerError = signal<string | null>(null);
/** Set when the founding screen succeeds: the map flies down to the new company's hub. */
export const flyHome = signal(false);
/** A Codex entry to open next, as when the companion points at one. */
export const codexFocus = signal<string | null>(null);
/** The companion's dialogue sheet on phones. */
export const companionOpen = signal(false);

export type MotionPref = 'system' | 'on' | 'off';
/** The player's reduced-motion choice; 'system' follows the browser. */
export const motionPref = signal<MotionPref>('system');
/** Whether the browser asks for reduced motion. */
export const systemReducedMotion = signal(false);
export const reducedMotion = computed(() =>
  motionPref.value === 'system' ? systemReducedMotion.value : motionPref.value === 'on',
);

/** The player's latest market fills, newest first, as the worker reports them. */
export const recentFills = signal<Extract<SimEvent, { t: 'trade' }>[]>([]);

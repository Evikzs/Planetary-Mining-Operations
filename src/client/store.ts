import { signal } from '@preact/signals';
import type { GameRenderer } from '../render/renderer';
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

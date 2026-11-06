import type { System } from './engine';
import type { SimEvent } from './events';

/** A public event and the tick it happened at. */
export type NewsItem = SimEvent & { tick: number };

/** Events everyone on the Moon hears of, rivals' included. */
export const NEWS_TYPES: ReadonlySet<SimEvent['t']> = new Set<SimEvent['t']>([
  'auctionOpened',
  'auctionWon',
  'auctionUnsold',
  'stakeDisclosed',
  'defaulted',
  'defaultCured',
  'ratingChanged',
  'bankrupt',
  'rivalFounded',
  'dividendPaid',
  'monthClosed',
  'debtWrittenOff',
]);

const NEWS_KEPT = 30;

/** Keeps the latest 30 public events, newest first. */
export const newsSystem: System = {
  id: 'news',
  step(state, ctx) {
    const fresh = ctx.events
      .filter((e) => NEWS_TYPES.has(e.t))
      .map((e) => ({ ...e, tick: state.tick }));
    if (fresh.length) state.news = [...fresh.reverse(), ...state.news].slice(0, NEWS_KEPT);
  },
};

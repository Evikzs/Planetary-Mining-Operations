import { OFFLINE } from '../data/balance';
import type { GoodId } from '../data/goods';
import { step } from './engine';
import { forPlayer, type SimEvent } from './events';
import { balance } from './ledger';
import type { GameState } from './state';
import { cashAccount, PLAYER, playerCompany } from './companies';
import type { Rating } from './finance/credit';
import { incomeStatement } from './finance/statements';
import type { NewsItem } from './news';

export interface AwaySummary {
  realMsAway: number;
  gameHours: number;
  /** True when the time away passed the 8-hour cap and the rest was dropped. */
  capped: boolean;
  cashDeltaCents: number;
  producedKg: Partial<Record<GoodId, number>>;
  soldKg: Partial<Record<GoodId, number>>;
  contractsCompleted: number;
  contractsFailed: number;
  arrivals: number;
  departures: number;
  alerts: SimEvent[];
  netIncomeCents: number;
  auctionsWon: number;
  /** Lots the player bid on that a rival won. */
  auctionsLost: number;
  ratingFrom: Rating;
  ratingTo: Rating;
  interestPaidCents: number;
  /** Up to 5 public events from the window, newest first. */
  news: NewsItem[];
  /** Sections the player held at the start and not at the end: seized for debt. */
  sectionsLost: number;
}

const ALERT_TYPES = new Set<SimEvent['t']>([
  'shortage',
  'strike',
  'emigration',
  'contractFailed',
  'brownout',
  'bidDefaulted',
  'defaulted',
  'debtWrittenOff',
]);

/** The alerts worth showing on return, one per type and place. */
export function awayAlerts(events: SimEvent[]): SimEvent[] {
  const kept = new Map<string, SimEvent>();
  for (const e of events) {
    if (!ALERT_TYPES.has(e.t)) continue;
    const where =
      e.t === 'shortage'
        ? `${e.sectionId}:${e.need}`
        : e.t === 'brownout'
          ? e.sectionId
          : e.t === 'strike'
            ? e.buildingId
            : e.t === 'contractFailed'
              ? e.contractId
              : '';
    const key = `${e.t}:${where}`;
    if (!kept.has(key)) kept.set(key, e);
  }
  return [...kept.values()];
}

function delta(
  after: Partial<Record<GoodId, number>>,
  before: Partial<Record<GoodId, number>>,
): Partial<Record<GoodId, number>> {
  const out: Partial<Record<GoodId, number>> = {};
  for (const [g, kg] of Object.entries(after) as [GoodId, number][]) {
    const d = kg - (before[g] ?? 0);
    if (d) out[g] = d;
  }
  return out;
}

/**
 * Runs the time the player was away, at half efficiency and at most 8 real hours:
 * fine ticks to the hour, coarse hours, then fine ticks for the rest.
 */
export function runCatchUp(
  state: GameState,
  realMsAway: number,
  timescale: number,
  onProgress?: (progress: number) => void,
): AwaySummary {
  const away = Math.max(0, realMsAway);
  const ms = Math.min(away, OFFLINE.capMs);
  const total = Math.floor((ms * timescale) / 1000 + 1e-9);
  const cash = balance(state.ledger, cashAccount(PLAYER));
  const produced = { ...state.stats.producedKg };
  const sold = { ...state.stats.soldKg };
  const company = playerCompany(state);
  const held = state.sections.filter((s) => s.owner === PLAYER).map((s) => s.id);
  const ratingFrom = company?.credit.rating ?? 'BBB';
  // The month so far, plus each month that closes in the window (dividends skip net income).
  const period = () => {
    const income = company ? incomeStatement(company.books.period) : null;
    return { net: income?.netIncome ?? 0, interest: income?.expense.interest ?? 0 };
  };
  const start = period();
  const closed = { net: 0, interest: 0 };
  const seenNews = new Set(state.news);
  const events: SimEvent[] = [];
  let auctionsLost = 0;
  const unpaid = new Set<number>();
  // The summary reports the player's company; rivals' events reach the player as news.
  const run = (mode: 'fine' | 'coarse') => {
    for (const e of step(state, { mode, offlineEfficiency: OFFLINE.efficiency })) {
      if (e.t === 'bidDefaulted' && e.companyId === PLAYER) unpaid.add(e.auctionId);
      // A lot the player won but could not pay for was not lost to a rival.
      if (e.t === 'auctionWon' && e.companyId !== PLAYER && !unpaid.has(e.auctionId)) {
        const lot = state.auctions.find((a) => a.id === e.auctionId);
        if (lot?.bids.some((b) => b.companyId === PLAYER)) auctionsLost++;
      }
      const month = e.t === 'monthClosed' && e.companyId === PLAYER && company?.books.closed[0];
      if (month) {
        closed.net += month.income.netIncome;
        closed.interest += month.income.expense.interest;
      }
      if (forPlayer(e)) events.push(e);
    }
  };

  let left = total;
  while (left > 0 && state.tick % 60 !== 0) {
    run('fine');
    left--;
  }
  for (let hours = 1; left >= 60; hours++) {
    run('coarse');
    left -= 60;
    if (hours % 24 === 0) onProgress?.((total - left) / total);
  }
  for (; left > 0; left--) run('fine');
  if (total > 0) onProgress?.(1);

  const count = (t: SimEvent['t']) => events.filter((e) => e.t === t).length;
  const people = (t: 'arrivals' | 'emigration') =>
    events.reduce((sum, e) => sum + (e.t === t ? e.count : 0), 0);
  return {
    realMsAway: away,
    gameHours: total / 60,
    capped: away > OFFLINE.capMs,
    cashDeltaCents: balance(state.ledger, cashAccount(PLAYER)) - cash,
    producedKg: delta(state.stats.producedKg, produced),
    soldKg: delta(state.stats.soldKg, sold),
    contractsCompleted: count('contractCompleted'),
    contractsFailed: count('contractFailed'),
    arrivals: people('arrivals'),
    departures: people('emigration'),
    alerts: awayAlerts(events),
    netIncomeCents: period().net + closed.net - start.net,
    auctionsWon: count('auctionWon'),
    auctionsLost,
    ratingFrom,
    ratingTo: company?.credit.rating ?? ratingFrom,
    interestPaidCents: period().interest + closed.interest - start.interest,
    news: state.news.filter((n) => !seenNews.has(n)).slice(0, 5),
    sectionsLost: held.filter(
      (id) => !state.sections.some((s) => s.id === id && s.owner === PLAYER),
    ).length,
  };
}

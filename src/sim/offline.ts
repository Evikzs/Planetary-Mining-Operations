import { OFFLINE } from '../data/balance';
import type { GoodId } from '../data/goods';
import { step } from './engine';
import type { SimEvent } from './events';
import { balance } from './ledger';
import type { GameState } from './state';

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
}

const ALERT_TYPES = new Set<SimEvent['t']>([
  'shortage',
  'strike',
  'emigration',
  'contractFailed',
  'brownout',
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
  const cash = balance(state.ledger, 'player');
  const produced = { ...state.stats.producedKg };
  const sold = { ...state.stats.soldKg };
  const events: SimEvent[] = [];
  const run = (mode: 'fine' | 'coarse') =>
    events.push(...step(state, { mode, offlineEfficiency: OFFLINE.efficiency }));

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
    cashDeltaCents: balance(state.ledger, 'player') - cash,
    producedKg: delta(state.stats.producedKg, produced),
    soldKg: delta(state.stats.soldKg, sold),
    contractsCompleted: count('contractCompleted'),
    contractsFailed: count('contractFailed'),
    arrivals: people('arrivals'),
    departures: people('emigration'),
    alerts: awayAlerts(events),
  };
}

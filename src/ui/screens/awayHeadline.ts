import { GOODS, type GoodGroup, type GoodId } from '../../data/goods';
import type { AwaySummary } from '../../sim/offline';

const NEED = { air: 'Air', water: 'Water', food: 'Food' } as const;
const OUTPUT: Record<GoodGroup, string> = {
  raw: 'Ore flows',
  refined: 'Refineries hum',
  component: 'Assembly lines roll',
};

/** The biggest story while the player was away: bad news first, then what the company made. */
function lead(s: AwaySummary): string {
  if (s.contractsFailed > 0) return s.contractsFailed > 1 ? 'Contracts lost' : 'Contract lost';
  for (const a of s.alerts) if (a.t === 'shortage') return `${NEED[a.need]} runs short`;
  if (s.alerts.some((a) => a.t === 'strike')) return 'Crews walk out';
  if (s.contractsCompleted > 0) {
    return s.contractsCompleted > 1 ? 'Contracts delivered' : 'Contract delivered';
  }
  // Output is weighed by value, so a tonne of steel outranks a tonne of regolith.
  const value: Record<GoodGroup, number> = { raw: 0, refined: 0, component: 0 };
  for (const [g, kg] of Object.entries(s.producedKg) as [GoodId, number][]) {
    value[GOODS[g].group] += kg * GOODS[g].basePriceCents;
  }
  const top = (Object.keys(value) as GoodGroup[]).reduce((a, b) => (value[b] > value[a] ? b : a));
  if (value[top] > 0) return OUTPUT[top];
  if (s.arrivals > s.departures) return 'New hands arrive';
  if (s.departures > s.arrivals) return 'Workers leave';
  return 'A quiet watch';
}

function cashLine(deltaCents: number, beforeCents: number): string {
  const pct = beforeCents > 0 ? Math.round((deltaCents / beforeCents) * 100) : null;
  if (deltaCents === 0 || pct === 0) return 'cash holds';
  const way = deltaCents > 0 ? 'up' : 'down';
  return pct === null ? `cash ${way}` : `cash ${way} ${Math.abs(pct)}%`;
}

/** 'Ore flows — cash up 42%': the away page's headline. The dash stays with the words before it. */
export function awayHeadline(s: AwaySummary, cashNowCents: number): string {
  return `${lead(s)}\u00a0— ${cashLine(s.cashDeltaCents, cashNowCents - s.cashDeltaCents)}`;
}

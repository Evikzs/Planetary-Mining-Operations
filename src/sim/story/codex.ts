import { BUILDING_IDS, BUILDINGS } from '../../data/buildings';
import { GOOD_IDS, type GoodId } from '../../data/goods';
import { balance } from '../ledger';
import type { GameState } from '../state';

export function unlockCodex(state: GameState, id: string): void {
  if (!state.story.codex.includes(id)) state.story.codex.push(id);
}

/** Opens entries for what the company holds, trades, has built, can afford or is offered. */
export function unlockFromState(state: GameState): void {
  const seen = new Set<string>();
  for (const s of state.sections) {
    for (const [g, kg] of Object.entries(s.depot)) if (kg) seen.add(g);
  }
  for (const o of state.orders) seen.add(o.goodId);
  for (const c of state.contracts) {
    for (const stage of c.stages)
      if (stage.kind === 'deliver') for (const g in stage.needKg) seen.add(g);
  }
  for (const g of GOOD_IDS) if (seen.has(g)) unlockCodex(state, `good.${g}`);

  const cash = balance(state.ledger, 'player');
  for (const type of BUILDING_IDS) {
    const def = BUILDINGS[type];
    if (def.plot !== 'build' && def.plot !== 'deposit') continue;
    const materials = Object.entries(def.cost.materials) as [GoodId, number][];
    const affordable =
      cash >= def.cost.cents &&
      state.sections.some((s) => materials.every(([g, t]) => (s.depot[g] ?? 0) >= t * 1000));
    if (affordable || state.buildings.some((b) => b.type === type)) {
      unlockCodex(state, `building.${type}`);
    }
  }
  for (const c of state.contracts) unlockCodex(state, `contract.${c.type}`);
  if (state.buildings.some((b) => b.type === 'warehouse')) {
    unlockCodex(state, 'concept.temporalArbitrage');
  }
}

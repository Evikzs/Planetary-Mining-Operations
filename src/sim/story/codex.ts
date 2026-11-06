import { BUILDING_IDS, BUILDINGS } from '../../data/buildings';
import { GOOD_IDS, type GoodId } from '../../data/goods';
import { balance } from '../ledger';
import type { GameState } from '../state';
import { buildingOwner, cashAccount, PLAYER } from '../companies';

export function unlockCodex(state: GameState, id: string): void {
  if (!state.story.codex.includes(id)) state.story.codex.push(id);
}

/** Opens entries for what the company holds, trades, has built, can afford or is offered. */
export function unlockFromState(state: GameState): void {
  const seen = new Set<string>();
  const sections = state.sections.filter((s) => s.owner === PLAYER);
  const contracts = state.contracts.filter(
    (c) => c.holder === PLAYER || (c.status === 'offered' && (c.tenderTo ?? PLAYER) === PLAYER),
  );
  const buildings = state.buildings.filter((b) => buildingOwner(state, b) === PLAYER);
  for (const s of sections) {
    for (const [g, kg] of Object.entries(s.depot)) if (kg) seen.add(g);
  }
  for (const o of state.orders) if (o.companyId === PLAYER) seen.add(o.goodId);
  for (const c of contracts) {
    for (const stage of c.stages)
      if (stage.kind === 'deliver') for (const g in stage.needKg) seen.add(g);
  }
  for (const g of GOOD_IDS) if (seen.has(g)) unlockCodex(state, `good.${g}`);

  const cash = balance(state.ledger, cashAccount(PLAYER));
  for (const type of BUILDING_IDS) {
    const def = BUILDINGS[type];
    if (def.plot !== 'build' && def.plot !== 'deposit') continue;
    const materials = Object.entries(def.cost.materials) as [GoodId, number][];
    const affordable =
      cash >= def.cost.cents &&
      sections.some((s) => materials.every(([g, t]) => (s.depot[g] ?? 0) >= t * 1000));
    if (affordable || buildings.some((b) => b.type === type)) {
      unlockCodex(state, `building.${type}`);
    }
  }
  for (const c of contracts) unlockCodex(state, `contract.${c.type}`);
  if (buildings.some((b) => b.type === 'warehouse')) {
    unlockCodex(state, 'concept.temporalArbitrage');
  }
}

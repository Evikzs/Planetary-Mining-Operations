import { LAND_PRICE } from '../../data/balance';
import { fail, OK, type CommandResult } from '../commands';
import { balance, transfer } from '../ledger';
import type { GameState } from '../state';
import { worldOf } from '../world/luna';
import { ownSection } from './sections';

export function landPrice(purchases: number): number {
  return Math.round(LAND_PRICE.baseCents * LAND_PRICE.growth ** purchases);
}

export function buyableSections(state: GameState): number[] {
  const owned = new Set(state.sections.map((s) => s.id));
  return worldOf(state)
    .sections.filter((s) => !owned.has(s.id) && s.neighbors.some((n) => owned.has(n)))
    .map((s) => s.id);
}

export function buySection(state: GameState, sectionId: number): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const world = worldOf(state);
  if (!world.sections[sectionId]) return fail('UNKNOWN_ID');
  if (state.sections.some((s) => s.id === sectionId)) return fail('ALREADY_OWNED');
  if (!buyableSections(state).includes(sectionId)) return fail('NOT_ADJACENT');
  const price = landPrice(state.landPurchases);
  if (balance(state.ledger, 'player') < price) return fail('INSUFFICIENT_CASH');
  transfer(state.ledger, 'player', 'world', price);
  state.landPurchases++;
  ownSection(state, sectionId);
  state.pendingEvents.push({ t: 'sectionBought', sectionId });
  return OK;
}

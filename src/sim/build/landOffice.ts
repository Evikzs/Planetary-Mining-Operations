import { LAND_PRICE } from '../../data/balance';
import { fail, OK, type CommandResult } from '../commands';
import { balance, transfer } from '../ledger';
import type { GameState } from '../state';
import { activeCompany, cashAccount, PLAYER, type CompanyId } from '../companies';
import { worldOf } from '../world/luna';
import { ownSection } from './sections';

export function landPrice(purchases: number): number {
  return Math.round(LAND_PRICE.baseCents * LAND_PRICE.growth ** purchases);
}

/** Unowned sections next to one of `actor`'s. */
export function buyableSections(state: GameState, actor: CompanyId = PLAYER): number[] {
  const owned = new Set(state.sections.map((s) => s.id));
  const mine = new Set(state.sections.filter((s) => s.owner === actor).map((s) => s.id));
  return worldOf(state)
    .sections.filter((s) => !owned.has(s.id) && s.neighbors.some((n) => mine.has(n)))
    .map((s) => s.id);
}

export function buySection(
  state: GameState,
  sectionId: number,
  actor: CompanyId = PLAYER,
): CommandResult {
  if (!activeCompany(state, actor)) return fail('NOT_FOUNDED');
  const world = worldOf(state);
  if (!world.sections[sectionId]) return fail('UNKNOWN_ID');
  if (state.sections.some((s) => s.id === sectionId)) return fail('ALREADY_OWNED');
  if (!buyableSections(state, actor).includes(sectionId)) return fail('NOT_ADJACENT');
  const price = landPrice(state.landPurchases);
  if (balance(state.ledger, cashAccount(actor)) < price) return fail('INSUFFICIENT_CASH');
  transfer(state.ledger, cashAccount(actor), 'world', price);
  state.landPurchases++;
  ownSection(state, sectionId, actor);
  state.pendingEvents.push({ t: 'sectionBought', sectionId, companyId: actor });
  return OK;
}

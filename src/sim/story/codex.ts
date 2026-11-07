import { BUILDING_IDS, BUILDINGS } from '../../data/buildings';
import { GOOD_IDS, type GoodId } from '../../data/goods';
import { balance } from '../ledger';
import type { GameState } from '../state';
import { buildingOwner, cashAccount, PLAYER } from '../companies';
import type { SimEvent } from '../events';

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
  // Founding: rivals share the Moon from the first day.
  unlockCodex(state, 'mech.rivals');
  if (state.loans.some((l) => l.companyId === PLAYER)) {
    unlockCodex(state, 'mech.loans');
    unlockCodex(state, 'concept.interest');
  }
  if (state.auctions.some((a) => a.proxies.some((p) => p.companyId === PLAYER))) {
    unlockCodex(state, 'concept.proxyBid');
  }
}

/** Entries the player's first contact with auctions, statements, credit and shares opens. */
export function unlockFromEvent(state: GameState, e: SimEvent): void {
  const open = (...ids: string[]) => ids.forEach((id) => unlockCodex(state, id));
  switch (e.t) {
    case 'auctionOpened':
      return open('mech.auctions', 'concept.englishAuction');
    case 'defaulted':
      return open('concept.default');
    case 'bankrupt':
      return open('concept.bankruptcy');
  }
  if (!('companyId' in e) || e.companyId !== PLAYER) return;
  switch (e.t) {
    case 'monthClosed':
      return open(
        'mech.statements',
        'mech.monthlyClose',
        'concept.balanceSheet',
        'concept.incomeStatement',
        'concept.cashFlow',
      );
    case 'ratingChanged':
      return open('concept.creditRating');
    case 'dividendPaid':
      return open('concept.dividends');
    case 'shareTrade':
      open('concept.shares', 'concept.priceEarnings');
      // Trading its own shares: selling new ones is an issue, buying them back a buyback.
      if (e.target === PLAYER) open(e.side === 'sell' ? 'concept.dilution' : 'concept.buyback');
      return;
  }
}

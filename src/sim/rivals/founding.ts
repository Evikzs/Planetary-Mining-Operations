import { ARCHETYPES, REPLACEMENT_NAMES, RIVALS, type CompanyColour } from '../../data/companies';
import { grantCharter } from '../build/founding';
import { makeCompany, playerCompany, type Archetype, type CompanyState } from '../companies';
import type { GameState } from '../state';
import { worldOf } from '../world/luna';

/** Neighbour hops from the nearest owned section, for every section. */
function hopsFromOwned(state: GameState): number[] {
  const world = worldOf(state);
  const dist = world.sections.map(() => Infinity);
  const queue: number[] = [];
  for (const s of state.sections) {
    dist[s.id] = 0;
    queue.push(s.id);
  }
  while (queue.length) {
    const at = queue.shift()!;
    for (const n of world.sections[at]!.neighbors) {
      if (dist[n]! > dist[at]! + 1) {
        dist[n] = dist[at]! + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** The unowned section, 2+ hops from every owned one, richest in the archetype's goods. */
export function chooseCharter(state: GameState, archetype: Archetype): number | null {
  const world = worldOf(state);
  const goods = new Set(ARCHETYPES[archetype].goods);
  const dist = hopsFromOwned(state);
  const onAuction = new Set(
    state.auctions.filter((a) => a.status === 'open').map((a) => a.lot.sectionId),
  );
  const richness = new Map<number, number>();
  for (const p of world.plots) {
    if (p.deposit && goods.has(p.deposit.goodId)) {
      richness.set(p.sectionId, (richness.get(p.sectionId) ?? 0) + p.deposit.richness);
    }
  }
  let best: number | null = null;
  let bestScore = -1;
  for (const s of world.sections) {
    if (dist[s.id]! < 2 || onAuction.has(s.id)) continue;
    const score = richness.get(s.id) ?? 0;
    if (score > bestScore) {
      best = s.id;
      bestScore = score;
    }
  }
  return best;
}

const taken = (state: GameState, name: string) =>
  state.companies.some((c) => c.name.toLowerCase() === name.toLowerCase());

/** The first replacement name no company uses. */
export function nextRivalName(state: GameState): string {
  return (
    REPLACEMENT_NAMES.find((n) => !taken(state, n)) ?? `Lunar Venture ${state.companies.length}`
  );
}

/** Founds a rival with the player's endowment on the best charter for its archetype. */
export function foundRival(
  state: GameState,
  name: string,
  archetype: Archetype,
  colour: CompanyColour,
): CompanyState | null {
  const sectionId = chooseCharter(state, archetype);
  if (sectionId === null) return null;
  const id = Math.max(...state.companies.map((c) => c.id)) + 1;
  const company = makeCompany(
    state,
    id,
    taken(state, name) ? nextRivalName(state) : name,
    'rival',
    sectionId,
  );
  company.archetype = archetype;
  company.colour = colour;
  const wage = ARCHETYPES[archetype].wage;
  company.wageLevel = { miner: wage, technician: wage, engineer: wage };
  state.companies.push(company);
  grantCharter(state, id, sectionId);
  return company;
}

/** The five rivals, founded after the player. */
export function foundRivals(state: GameState): void {
  for (const r of RIVALS) foundRival(state, r.name, r.archetype, r.colour);
}

/** A founded game with no rivals yet, from a save before M2a, gets them now. */
export function ensureRivals(state: GameState): void {
  if (state.withRivals && playerCompany(state) && state.companies.length === 1) foundRivals(state);
}

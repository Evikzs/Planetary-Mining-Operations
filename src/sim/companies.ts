import type { WageLevel } from '../data/balance';
import type { Skill } from '../data/buildings';
import type { Building, CompanionId, GameState } from './state';
import { emptyBooks, type Books } from './finance/books';

export type CompanyId = number;
/** The player's company; rivals get ids from 1 up, never reused. */
export const PLAYER: CompanyId = 0;

export type Archetype = 'expander' | 'cautiousMiner' | 'financier' | 'pirateLinked' | 'stateBacked';

export interface CompanyState {
  id: CompanyId;
  name: string;
  kind: 'player' | 'rival';
  archetype: Archetype | null;
  companionId: CompanionId | null;
  status: 'active' | 'bankrupt';
  foundedTick: number;
  charterSectionId: number;
  /** 0..100 each, start 20. M2a moves both together: every company acts on Luna only. */
  reputation: { group: number; luna: number };
  wageLevel: Record<Skill, WageLevel>;
  payrollShortfall: boolean;
  books: Books;
}

export type CashAccount = `co:${number}`;

export const cashAccount = (id: CompanyId): CashAccount => `co:${id}`;

/** A new company record with M2a's starting values; the caller adds it to the state. */
export function makeCompany(
  state: GameState,
  id: CompanyId,
  name: string,
  kind: CompanyState['kind'],
  charterSectionId: number,
): CompanyState {
  return {
    id,
    name,
    kind,
    archetype: null,
    companionId: null,
    status: 'active',
    foundedTick: state.tick,
    charterSectionId,
    reputation: { group: 20, luna: 20 },
    wageLevel: { miner: 'standard', technician: 'standard', engineer: 'standard' },
    payrollShortfall: false,
    books: emptyBooks(),
  };
}

export function companyOf(state: GameState, id: CompanyId): CompanyState | undefined {
  return state.companies.find((c) => c.id === id);
}

export function activeCompany(state: GameState, id: CompanyId): CompanyState | undefined {
  const c = companyOf(state, id);
  return c?.status === 'active' ? c : undefined;
}

export const playerCompany = (state: GameState): CompanyState | undefined =>
  companyOf(state, PLAYER);

/** The owner of a section, or null for the Lunar Authority. */
export function sectionOwner(state: GameState, sectionId: number): CompanyId | null {
  return state.sections.find((s) => s.id === sectionId)?.owner ?? null;
}

export const buildingOwner = (state: GameState, b: Building): CompanyId | null =>
  sectionOwner(state, b.sectionId);

/** Each building's owner by building id; workers belong to the owner of their home. */
export function ownersByBuilding(state: GameState): Map<number, CompanyId> {
  const owner = new Map(state.sections.map((s) => [s.id, s.owner]));
  const out = new Map<number, CompanyId>();
  for (const b of state.buildings) {
    const o = owner.get(b.sectionId);
    if (o !== undefined) out.set(b.id, o);
  }
  return out;
}

/** The company a worker works for: the owner of the section they live in. */
export function workerCompany(state: GameState, index: number): CompanyId | null {
  const home = state.buildings.find((b) => b.id === state.people.home[index]);
  return home ? buildingOwner(state, home) : null;
}

/** The best Lunar reputation among active companies: the shared board grows with it. */
export function bestReputation(state: GameState): number {
  let best = 0;
  for (const c of state.companies) {
    if (c.status === 'active') best = Math.max(best, c.reputation.luna);
  }
  return best;
}

/** Moves both reputation values, each kept within 0..100. */
export function changeReputation(state: GameState, id: CompanyId, delta: number): void {
  const c = companyOf(state, id);
  if (!c) return;
  const move = (v: number) => Math.min(100, Math.max(0, v + delta));
  c.reputation = { group: move(c.reputation.group), luna: move(c.reputation.luna) };
}

import type { WageLevel } from '../data/balance';
import type { Skill } from '../data/buildings';
import type { Building, CompanionId, GameState } from './state';

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

/** Moves both reputation values, each kept within 0..100. */
export function changeReputation(state: GameState, id: CompanyId, delta: number): void {
  const c = companyOf(state, id);
  if (!c) return;
  const move = (v: number) => Math.min(100, Math.max(0, v + delta));
  c.reputation = { group: move(c.reputation.group), luna: move(c.reputation.luna) };
}

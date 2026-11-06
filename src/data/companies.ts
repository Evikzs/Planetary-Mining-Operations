import type { WageLevel } from './balance';
import type { Archetype } from '../sim/companies';
import type { RawGoodId } from '../sim/world/types';

/** Palette token names a company's sections are drawn in. */
export type CompanyColour = 'burntOrange' | 'teal' | 'mustard' | 'dustyPink' | 'rust' | 'navy';
export const PLAYER_COLOUR: CompanyColour = 'burntOrange';

/** The five rivals founded with the player. Fictional names. */
export const RIVALS: { name: string; archetype: Archetype; colour: CompanyColour }[] = [
  { name: 'Tycho Deepworks', archetype: 'expander', colour: 'teal' },
  { name: 'Nubium Mineral Company', archetype: 'cautiousMiner', colour: 'mustard' },
  { name: 'Grey Ledger Capital', archetype: 'financier', colour: 'dustyPink' },
  { name: 'Blackrim Salvage', archetype: 'pirateLinked', colour: 'rust' },
  { name: 'Selenic State Works', archetype: 'stateBacked', colour: 'navy' },
];

/** Names for rivals founded later, and for a rival whose name the player took. */
/**
 * Game hours a public ore offer stands on the board before rivals consider it: the player, who
 * plays in sessions, gets first look. Unclaimed offers then go to whoever can fill them.
 */
export const OFFER_WAIT_HOURS = 12;

export const REPLACEMENT_NAMES = [
  'Aitken Basin Resources',
  'Clavius Ridge Ventures',
  'Mare Frigoris Holdings',
  'Aristarchus Light Mining',
  'Plato Crater Works',
  'Rupes Recta Extraction',
];

export interface ArchetypeWeights {
  extract: number;
  process: number;
  trade: number;
  expand: number;
  finance: number;
  maxDebtToEquity: number;
  auctionAggression: number;
  dividendRatio: number;
  wage: WageLevel;
  paybackDays: number;
  /** Deposits it looks for in a charter. */
  goods: RawGoodId[];
}

export const ARCHETYPES: Record<Archetype, ArchetypeWeights> = {
  expander: {
    extract: 1.0,
    process: 0.8,
    trade: 0.8,
    expand: 1.6,
    finance: 0.6,
    maxDebtToEquity: 1.2,
    auctionAggression: 1.3,
    dividendRatio: 0,
    wage: 'standard',
    paybackDays: 12,
    goods: ['ilmenite', 'anorthite', 'regolith'],
  },
  cautiousMiner: {
    extract: 1.3,
    process: 0.6,
    trade: 1.0,
    expand: 0.6,
    finance: 0.4,
    maxDebtToEquity: 0.4,
    auctionAggression: 0.8,
    dividendRatio: 0.3,
    wage: 'standard',
    paybackDays: 6,
    goods: ['ilmenite', 'regolith', 'polarVolatiles'],
  },
  financier: {
    extract: 0.8,
    process: 1.0,
    trade: 1.2,
    expand: 0.8,
    finance: 1.6,
    maxDebtToEquity: 0.9,
    auctionAggression: 1.0,
    dividendRatio: 0.2,
    wage: 'standard',
    paybackDays: 8,
    goods: ['anorthite', 'kreep'],
  },
  pirateLinked: {
    extract: 1.1,
    process: 0.6,
    trade: 1.4,
    expand: 1.0,
    finance: 0.8,
    maxDebtToEquity: 1.5,
    auctionAggression: 1.5,
    dividendRatio: 0,
    wage: 'low',
    paybackDays: 8,
    goods: ['helium3', 'kreep', 'ilmenite'],
  },
  stateBacked: {
    extract: 1.0,
    process: 1.2,
    trade: 0.8,
    expand: 1.0,
    finance: 0.6,
    maxDebtToEquity: 1.0,
    auctionAggression: 1.0,
    dividendRatio: 0.4,
    wage: 'high',
    paybackDays: 16,
    goods: ['polarVolatiles', 'anorthite', 'regolith'],
  },
};

import { COLONY } from '../../data/balance';
import type { GoodDef } from '../../data/goods';

/** How much the colony's demand has grown since founding. */
export const colonyScale = (colonyPop: number) =>
  (colonyPop / COLONY.startPop) ** COLONY.demandExponent;

/** NPC demand in tonnes per hour at price p. */
export function npcDemandTph(g: GoodDef, pCents: number, pRef: number, scale: number): number {
  return g.npc.volumeTph * scale * (pCents / pRef) ** -g.npc.demandElasticity;
}

/** NPC supply in tonnes per hour at price p. */
export function npcSupplyTph(g: GoodDef, pCents: number, pRef: number): number {
  return g.npc.volumeTph * (pCents / pRef) ** g.npc.supplyElasticity;
}

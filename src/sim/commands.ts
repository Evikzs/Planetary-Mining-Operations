import type { BuildingTypeId, RecipeId, Skill } from '../data/buildings';
import type { WageLevel } from '../data/balance';
import type { GoodId } from '../data/goods';
import type { BeatId, HintCategory } from './story/beats';
import type { CompanionId, Priority } from './state';

// Later tasks add members to these unions.
export type Command =
  | { t: 'foundCompany'; name: string; companionId: CompanionId }
  | { t: 'build'; plotId: number; type: BuildingTypeId; recipeId?: RecipeId }
  | { t: 'upgrade'; buildingId: number }
  | { t: 'demolish'; buildingId: number }
  | { t: 'setRecipe'; buildingId: number; recipeId: RecipeId }
  | { t: 'setPriority'; buildingId: number; priority: Priority }
  | { t: 'buySection'; sectionId: number }
  | { t: 'setWageLevel'; skill: Skill; level: WageLevel }
  | {
      t: 'assignWorker';
      workerId: number;
      buildingId: number | null;
      shift?: 0 | 1 | 2;
      lock: boolean;
    }
  | {
      t: 'placeOrder';
      goodId: GoodId;
      side: 'buy' | 'sell';
      kind: 'market' | 'limit' | 'standing';
      qtyKg: number;
      limitCents?: number;
      sectionId: number;
    }
  | { t: 'cancelOrder'; orderId: number }
  | { t: 'acceptContract'; contractId: number }
  | { t: 'deliverContract'; contractId: number; sectionId: number }
  | { t: 'abandonContract'; contractId: number }
  | { t: 'storyAck'; beatId: BeatId }
  | { t: 'setHintMute'; category: HintCategory; muted: boolean }
  | { t: 'cameraTaught'; panned?: boolean; zoomed?: boolean };

export type CommandError =
  | 'ALREADY_FOUNDED'
  | 'NOT_FOUNDED'
  | 'INVALID_NAME'
  | 'COMPANION_UNAVAILABLE'
  | 'UNKNOWN_ID'
  | 'NOT_OWNED'
  | 'PLOT_OCCUPIED'
  | 'WRONG_PLOT_KIND'
  | 'NO_DEPOSIT_MATCH'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_MATERIALS'
  | 'NO_ROAD_ACCESS'
  | 'MAX_LEVEL'
  | 'NOT_ADJACENT'
  | 'ALREADY_OWNED'
  | 'INVALID_RECIPE'
  | 'BUSY'
  | 'CANNOT_DEMOLISH'
  | 'NO_OPEN_SLOT'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_ORDER'
  | 'STORAGE_FULL'
  | 'CONTRACT_LIMIT'
  | 'NOT_ACTIVE';

export type CommandResult = { ok: true } | { ok: false; error: CommandError };

export const OK: CommandResult = { ok: true };
export const fail = (error: CommandError): CommandResult => ({ ok: false, error });

const NAME_RULE = /^[\p{L}\p{N} '.&-]{3,32}$/u;

export function isValidCompanyName(name: string): boolean {
  return NAME_RULE.test(name.trim());
}

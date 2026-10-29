import type { Alert } from '../sim/alerts';
import type { CommandError } from '../sim/commands';
import type { BuildingStatus, Priority } from '../sim/state';
import type { PlotKind } from '../sim/world/types';
import type { Skill } from './buildings';
import { GOODS } from './goods';

export const ERROR_COPY: Record<CommandError, string> = {
  NOT_OWNED: 'You do not own this section.',
  PLOT_OCCUPIED: 'This plot already has a building.',
  WRONG_PLOT_KIND: 'This building cannot go on this kind of plot.',
  NO_DEPOSIT_MATCH: 'This deposit does not hold what this building extracts.',
  INSUFFICIENT_CASH: 'Not enough cash.',
  INSUFFICIENT_MATERIALS: "Not enough materials in this section's depot.",
  NO_ROAD_ACCESS: 'No road can reach this plot. The ground around it is too steep.',
  MAX_LEVEL: 'This building is at the highest level.',
  NOT_ADJACENT: 'You can only buy a section next to one you own.',
  INVALID_NAME: 'Use 3 to 32 letters, numbers or spaces.',
  CONTRACT_LIMIT: 'You hold the most contracts your reputation allows.',
  INSUFFICIENT_STOCK: 'Not enough stock in this depot.',
  INVALID_ORDER: 'Check the amount and the price.',
  STORAGE_FULL: 'The depot is full.',
  UNKNOWN_ID: 'That item no longer exists.',
  NOT_FOUNDED: 'Found your company first.',
  ALREADY_FOUNDED: 'Your company already exists.',
  COMPANION_UNAVAILABLE: 'This companion arrives in a later update.',
  INVALID_RECIPE: 'This building cannot use that recipe.',
  BUSY: 'Wait until the work on this building is done.',
  NOT_ACTIVE: 'This contract is not active.',
  ALREADY_OWNED: 'You already own this section.',
  CANNOT_DEMOLISH: 'This building cannot be demolished.',
  NO_OPEN_SLOT: 'This building has no open job for this worker.',
};

export const BUILDING_STATUS: Record<BuildingStatus, string> = {
  constructing: 'Under construction',
  upgrading: 'Upgrading',
  active: 'Working',
  blocked: 'Stopped: no room for its output',
  unpowered: 'Short of power',
  unstaffed: 'No workers on shift',
  striking: 'On strike',
};

export const PLOT_KIND_NAMES: Record<PlotKind, string> = {
  hub: 'Hub plot',
  build: 'Build plot',
  deposit: 'Deposit',
  public: 'Public plot',
};

export const SKILL_NAME: Record<Skill, string> = {
  miner: 'Miner',
  technician: 'Technician',
  engineer: 'Engineer',
};

/** Plural, as in 'Technicians 1/1'. */
export const SKILL_NAMES: Record<Skill, string> = {
  miner: 'Miners',
  technician: 'Technicians',
  engineer: 'Engineers',
};

export const PRIORITY_NAMES: Record<Priority, string> = {
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const NEED_NAME = { air: 'Oxygen', water: 'Water', food: 'Food' } as const;

/** Names the alert text needs from the world: a building, or the building at a belt's end. */
export interface AlertNames {
  building(id: number): string | null;
  belt(id: number): string | null;
}

/** One plain sentence per alert. */
export function alertText(alert: Alert, names: AlertNames): string {
  switch (alert.t) {
    case 'shortage': {
      const days = Math.round(alert.daysLeft);
      const when =
        alert.daysLeft < 1 ? 'in less than a day' : `in about ${days} day${days === 1 ? '' : 's'}`;
      return `${NEED_NAME[alert.need]} runs out ${when} in section ${alert.sectionId}.`;
    }
    case 'brownout':
      return `Section ${alert.sectionId} is short of power. Machines run at ${Math.round(alert.factor * 100)}%.`;
    case 'beltJammed':
      return `The ${names.belt(alert.beltId) ?? 'conveyor'} belt is jammed. Its depot is full.`;
    case 'strike':
      return `Workers at the ${names.building(alert.buildingId) ?? 'site'} are on strike.`;
    case 'emigration':
      return `${alert.count} worker${alert.count === 1 ? '' : 's'} left the colony.`;
    case 'contractFailed':
      return 'A contract failed. You lost reputation.';
    case 'priceMove': {
      const pct = Math.round(Math.abs(alert.pct24h) * 100);
      return `${GOODS[alert.goodId].name} ${alert.pct24h < 0 ? 'fell' : 'rose'} ${pct}% in a day.`;
    }
    default:
      return 'Something needs your attention.';
  }
}

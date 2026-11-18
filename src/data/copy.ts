import type { Alert } from '../sim/alerts';
import type { CommandError } from '../sim/commands';
import type { CompanyId } from '../sim/companies';
import type { SimEvent } from '../sim/events';
import type { BuildingStatus, Priority } from '../sim/state';
import type { NewsItem } from '../sim/news';
import type { PlotKind } from '../sim/world/types';
import { formatMoney } from '../ui/format';
import type { BuildingTypeId, Skill } from './buildings';
import type { Asset } from '../sim/contracts/contracts';
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
  CANNOT_DEMOLISH: 'This building cannot be demolished.',
  CREDIT_LIMIT: 'That is more than your credit allows.',
  NO_CREDIT: 'Lenders give no credit at rating D.',
  INSUFFICIENT_SHARES: 'You do not hold that many shares.',
  ISSUE_LIMIT: 'You can issue at most 20% more shares each month.',
  NOT_FOR_SALE: 'This section is not for sale now.',
  BID_TOO_LOW: 'Bid at least the minimum shown.',
  AUCTION_CLOSED: 'This auction has ended.',
  AUCTION_LIMIT: 'Too many auctions are open. Wait until one ends.',
  LOW_REPUTATION: 'Your reputation is too low to bid.',
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

/** What each building is for, in one line, under its name on the selection sheet. */
export const BUILDING_ROLE: Record<BuildingTypeId, string> = {
  depot: 'The heart of a section. Goods come in, goods go out, buses start here.',
  regolithScoop: 'Scrapes the loose top of the ground into the hopper.',
  mine: 'Winds the cage down the shaft and brings the ore up.',
  iceDrill: 'Bores into the frozen floor of a dark crater.',
  he3Harvester: 'Heats the dust and keeps the gas the solar wind left in it.',
  smelter: 'Melts the ore into metal. Its furnace never cools.',
  waferFab: 'Clean rooms that grow silicon into wafers.',
  chemicalRefinery: 'Pulls the rare earths and the salts out of the rock.',
  electrolysisPlant: 'Splits water into the air you breathe and the fuel you burn.',
  airPlant: 'Bakes oxygen out of the rock. Every breath in the section starts here.',
  waterPlant: 'Melts and cleans the ice. Water for the homes and the farms.',
  hydroponicsFarm: 'Food under glass, in water, under lamps.',
  assemblyWorks: 'Puts panels, frames and machines together.',
  solarArray: 'Power by day. Nothing at night.',
  crewQuarters: 'Bunks for the crews and their families.',
  habitatDome: 'Homes under a dome, with air enough for a garden.',
  warehouse: 'Racks and bays for what the depot has no room for.',
  roverGarage: 'Keeps the buses running and sends them out at each shift.',
  contractSite: 'Work for a client. The job board says what it needs.',
};

/** Names of what you build for clients. */
export const ASSET_NAMES: Record<Asset, string> = {
  landingPad: 'Landing pad',
  commMast: 'Signal mast',
  roadDepot: 'Road depot',
  publicSolar: 'Public solar',
};

/** The same for what you build for clients. */
export const ASSET_ROLE: Record<Asset, string> = {
  landingPad: 'Landers set down here. Built for a client.',
  commMast: 'Talks to orbit and to Earth. Built for a client.',
  roadDepot: 'Graders and rollers for the public roads. Built for a client.',
  publicSolar: 'Power for anyone on the grid. Built for a client.',
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

/** One plain sentence per alert, from the record or fresh from the sim. */
export function alertText(alert: Alert | SimEvent, names: AlertNames): string {
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
    case 'bidDefaulted':
      return 'You could not pay for a lot you won. It went to the next bidder, and you lost reputation.';
    case 'debtWrittenOff':
      return `Lenders wrote off ${formatMoney(alert.cents)} of your debt. Your reputation fell.`;
    case 'defaulted':
      return `You missed a payment of ${formatMoney(alert.owedCents)}. Lenders sell your stock until it is paid.`;
    default:
      return 'Something needs your attention.';
  }
}

const RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];

/** One plain sentence per piece of news; `name` gives a company's name ("You" for the player). */
export function newsText(item: NewsItem, name: (id: CompanyId) => string): string {
  switch (item.t) {
    case 'auctionOpened':
      return `${item.companyId === null ? 'The Lunar Authority' : name(item.companyId)} put section ${item.sectionId} up for auction.`;
    case 'auctionWon':
      return `${name(item.companyId)} won section ${item.sectionId} for ${formatMoney(item.amountCents)}.`;
    case 'auctionUnsold':
      return `Section ${item.sectionId} found no buyer.`;
    case 'stakeDisclosed':
      return `${name(item.holder)} now holds ${Math.round(item.pct * 100)}% of ${name(item.companyId)}.`;
    case 'defaulted':
      return `${name(item.companyId)} missed a payment of ${formatMoney(item.owedCents)}.`;
    case 'defaultCured':
      return `${name(item.companyId)} paid what it owed.`;
    case 'ratingChanged': {
      const fell = RATING_ORDER.indexOf(item.to) > RATING_ORDER.indexOf(item.from);
      return `${name(item.companyId)}'s credit rating ${fell ? 'fell' : 'rose'} from ${item.from} to ${item.to}.`;
    }
    case 'bankrupt':
      return `${name(item.companyId)} went bankrupt. Its sections go to auction.`;
    case 'rivalFounded':
      return `${name(item.companyId)} was founded.`;
    case 'dividendPaid':
      return `${name(item.companyId)} paid a dividend of ${formatMoney(item.perShareCents)} a share.`;
    case 'monthClosed':
      return `${name(item.companyId)} closed ${item.label} with a ${item.netIncomeCents < 0 ? 'loss' : 'profit'} of ${formatMoney(Math.abs(item.netIncomeCents))}.`;
    case 'debtWrittenOff':
      return `Lenders wrote off ${formatMoney(item.cents)} that ${name(item.companyId)} owed.`;
    default:
      return 'News from the Moon.';
  }
}

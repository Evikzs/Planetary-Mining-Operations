import { beltsSystem } from './build/belts';
import {
  build,
  constructionSystem,
  demolish,
  setPriority,
  setRecipe,
  upgrade,
} from './build/construction';
import { grantCharter } from './build/founding';
import { powerSystem } from './build/power';
import { productionSystem } from './build/production';
import { shiftStartingAt } from './clock';
import {
  abandonContract,
  acceptContract,
  contractsSystem,
  deliverContract,
} from './contracts/contracts';
import { alertsSystem } from './alerts';
import { marketSystem } from './market/market';
import { cameraTaught, setHintMute, startStory, storyAck, storySystem } from './story/story';
import { cancelOrder, placeOrder } from './market/orders';
import { commuteSystem } from './people/commute';
import { assignWorker, jobsSystem } from './people/jobs';
import { migrationSystem } from './people/migration';
import { moraleSystem } from './people/morale';
import { needsSystem } from './people/needs';
import { payrollSystem } from './people/payroll';
import { fail, isValidCompanyName, OK, type Command, type CommandResult } from './commands';
import type { SimEvent } from './events';
import { rngFromState, type Rng } from './rng';
import { createInitialState, type GameState } from './state';
import { activeCompany, makeCompany, PLAYER, playerCompany, type CompanyId } from './companies';
import { worldOf } from './world/luna';
import { closeSystem } from './finance/statements';
import { creditSystem, drawCredit, repayCredit, repayLoan, takeLoan } from './finance/credit';
import {
  cancelShareOrder,
  issueShares,
  placeShareOrder,
  setDividendRatio,
  sharesSystem,
} from './finance/shares';
import { auctionsSystem, openAuction, placeBid, setProxy } from './auctions';
import { foundRivals } from './rivals/founding';
import { rivalsSystem } from './rivals/ai';
import { solvencySystem } from './rivals/solvency';
import { newsSystem } from './news';

export type StepMode = 'fine' | 'coarse';

export interface StepContext {
  dtMinutes: number;
  mode: StepMode;
  offlineEfficiency: number;
  events: SimEvent[];
  rng: Rng;
}

export interface System {
  id: string;
  step(state: GameState, ctx: StepContext): void;
}

/** Advances the clock first, so later systems see the new tick. */
const clockSystem: System = {
  id: 'clock',
  step(state, ctx) {
    for (let t = state.tick + 1; t <= state.tick + ctx.dtMinutes; t++) {
      const shift = shiftStartingAt(t);
      if (shift !== null) ctx.events.push({ t: 'shiftChange', shift });
    }
    state.tick += ctx.dtMinutes;
  },
};

export const SYSTEMS: System[] = [
  clockSystem,
  constructionSystem,
  // Crews first: power and production must see the same workers at work.
  jobsSystem,
  commuteSystem,
  powerSystem,
  needsSystem,
  moraleSystem,
  migrationSystem,
  payrollSystem,
  creditSystem,
  beltsSystem,
  productionSystem,
  marketSystem,
  sharesSystem,
  contractsSystem,
  auctionsSystem,
  rivalsSystem,
  closeSystem,
  solvencySystem,
  newsSystem,
  storySystem,
  alertsSystem,
];

/** A new game; `rivals: false` founds the player alone (single-company tests and benches). */
export function createGame(seed: number, opts: { rivals?: boolean } = {}): GameState {
  const state = createInitialState(seed);
  state.withRivals = opts.rivals ?? true;
  return state;
}

export function applyCommand(
  state: GameState,
  cmd: Command,
  actor: CompanyId = PLAYER,
): CommandResult {
  switch (cmd.t) {
    case 'foundCompany': {
      if (actor !== PLAYER) return fail('NOT_OWNED');
      if (playerCompany(state)) return fail('ALREADY_FOUNDED');
      if (!isValidCompanyName(cmd.name)) return fail('INVALID_NAME');
      if (cmd.companionId !== 'veteran') return fail('COMPANION_UNAVAILABLE');
      const charter = worldOf(state).foundingSectionId;
      const company = makeCompany(state, PLAYER, cmd.name.trim(), 'player', charter);
      company.companionId = cmd.companionId;
      state.companies.push(company);
      grantCharter(state, PLAYER, charter);
      if (state.withRivals) foundRivals(state);
      startStory(state);
      state.pendingEvents.push({ t: 'founded', companyId: PLAYER });
      return OK;
    }
    case 'build':
      return build(state, cmd, actor);
    case 'upgrade':
      return upgrade(state, cmd.buildingId, actor);
    case 'demolish':
      return demolish(state, cmd.buildingId, actor);
    case 'setRecipe':
      return setRecipe(state, cmd.buildingId, cmd.recipeId, actor);
    case 'setPriority':
      return setPriority(state, cmd.buildingId, cmd.priority, actor);
    case 'storyAck':
      return actor === PLAYER ? storyAck(state, cmd.beatId) : fail('NOT_OWNED');
    case 'setHintMute':
      return actor === PLAYER ? setHintMute(state, cmd.category, cmd.muted) : fail('NOT_OWNED');
    case 'cameraTaught':
      return actor === PLAYER ? cameraTaught(state, cmd.panned, cmd.zoomed) : fail('NOT_OWNED');
    case 'acceptContract':
      return acceptContract(state, cmd.contractId, actor);
    case 'deliverContract':
      return deliverContract(state, cmd.contractId, cmd.sectionId, actor);
    case 'abandonContract':
      return abandonContract(state, cmd.contractId, actor);
    case 'placeOrder':
      return placeOrder(state, cmd, actor);
    case 'cancelOrder':
      return cancelOrder(state, cmd.orderId, actor);
    case 'assignWorker':
      return assignWorker(state, cmd, actor);
    case 'takeLoan':
      return takeLoan(state, cmd, actor);
    case 'repayLoan':
      return repayLoan(state, cmd, actor);
    case 'drawCredit':
      return drawCredit(state, cmd.amountCents, actor);
    case 'repayCredit':
      return repayCredit(state, cmd.amountCents, actor);
    case 'placeShareOrder':
      return placeShareOrder(state, cmd, actor);
    case 'cancelShareOrder':
      return cancelShareOrder(state, cmd.orderId, actor);
    case 'issueShares':
      return issueShares(state, cmd.qty, actor);
    case 'setDividendRatio':
      return setDividendRatio(state, cmd.ratio, actor);
    case 'openAuction':
      return openAuction(state, cmd.sectionId, actor);
    case 'placeBid':
      return placeBid(state, cmd.auctionId, cmd.amountCents, actor);
    case 'setProxy':
      return setProxy(state, cmd.auctionId, cmd.ceilingCents, actor);
    case 'setWageLevel': {
      const company = activeCompany(state, actor);
      if (!company) return fail('NOT_FOUNDED');
      company.wageLevel[cmd.skill] = cmd.level;
      return OK;
    }
  }
}

export function step(
  state: GameState,
  opts: { mode: StepMode; offlineEfficiency?: number },
): SimEvent[] {
  const dtMinutes = opts.mode === 'fine' ? 1 : 60;
  if (opts.mode === 'coarse' && state.tick % 60 !== 0) {
    throw new Error('coarse step must start on the hour');
  }
  const rng = rngFromState(state.rng);
  const ctx: StepContext = {
    dtMinutes,
    mode: opts.mode,
    offlineEfficiency: opts.offlineEfficiency ?? 1,
    events: state.pendingEvents.splice(0),
    rng,
  };
  for (const system of SYSTEMS) system.step(state, ctx);
  state.rng = rng.getState();
  return ctx.events;
}

import type { GoodId } from '../../data/goods';
import { plotOccupied } from '../build/construction';
import { addBuilding, gridFor, sectionState } from '../build/sections';
import { fail, OK, type CommandResult } from '../commands';
import type { StepContext, System } from '../engine';
import { take } from '../inventory';
import { transfer } from '../ledger';
import { presentCrew, releaseWorkers } from '../people/jobs';
import { newId, type GameState } from '../state';
import { worldOf } from '../world/luna';
import { connectToNetwork } from '../world/roads';
import { generateOffer } from './generate';
import { boardSize, maxActive } from './rewards';

export type ContractType = 'oreDelivery' | 'infrastructure';
export type Issuer = 'Lunar Authority' | 'Shackleton Colony' | 'Peary Settlement';
export type Asset = 'landingPad' | 'commMast' | 'roadDepot' | 'publicSolar';

export type Stage =
  | {
      kind: 'deliver';
      needKg: Partial<Record<GoodId, number>>;
      doneKg: Partial<Record<GoodId, number>>;
    }
  | { kind: 'build'; engineerHours: number; done: number }
  | { kind: 'staff'; technicians: number; hours: number; done: number };

export interface Contract {
  id: number;
  type: ContractType;
  issuer: Issuer;
  status: 'offered' | 'active' | 'completed' | 'failed' | 'abandoned';
  offeredTick: number;
  /** While offered: when the offer lapses. Once accepted: when the work is due. */
  deadlineTick: number;
  /** Game hours the work may take once accepted. */
  hours: number;
  rewardCents: number;
  repGain: number;
  repLoss: number;
  stages: Stage[];
  stageIndex: number;
  plotId: number | null;
  asset: Asset | null;
}

const BUILD_CREW = 2;
const ABANDON_REP = 4;
/** Finished contracts kept for the record. */
const FINISHED_KEPT = 20;

const changeReputation = (state: GameState, delta: number) => {
  state.reputation = Math.min(100, Math.max(0, state.reputation + delta));
};

const siteOf = (state: GameState, c: Contract) =>
  c.plotId === null
    ? undefined
    : state.buildings.find((b) => b.plotId === c.plotId && b.type === 'contractSite');

/** Gives the site the job slots its current stage needs; the last stage's crew is let go. */
function staffSite(state: GameState, c: Contract): void {
  const site = siteOf(state, c);
  if (!site) return;
  releaseWorkers(state, site.id);
  const stage = c.stages[c.stageIndex];
  site.jobs =
    stage?.kind === 'build'
      ? { engineer: BUILD_CREW }
      : stage?.kind === 'staff'
        ? { technician: stage.technicians }
        : {};
}

function advance(state: GameState, c: Contract): void {
  c.stageIndex++;
  staffSite(state, c);
}

function closeSite(state: GameState, c: Contract): void {
  const site = siteOf(state, c);
  if (!site) return;
  releaseWorkers(state, site.id);
  state.buildings = state.buildings.filter((b) => b !== site);
}

export function acceptContract(state: GameState, contractId: number): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const c = state.contracts.find((x) => x.id === contractId && x.status === 'offered');
  if (!c) return fail('UNKNOWN_ID');
  const active = state.contracts.filter((x) => x.status === 'active').length;
  if (active >= maxActive(state.reputation)) return fail('CONTRACT_LIMIT');
  if (c.plotId !== null) {
    const plot = worldOf(state).plots[c.plotId]!;
    const section = sectionState(state, plot.sectionId);
    if (!section) return fail('NOT_OWNED');
    if (plotOccupied(state, plot.id)) return fail('PLOT_OCCUPIED');
    const road = connectToNetwork(gridFor(state, plot.sectionId), section.roadNet!, plot.dir, () =>
      newId(state),
    );
    if (!road) return fail('NO_ROAD_ACCESS');
    addBuilding(state, plot, 'contractSite', 'active');
  }
  c.status = 'active';
  c.deadlineTick = state.tick + c.hours * 60;
  staffSite(state, c);
  return OK;
}

/** Hands over what the depot holds toward the current delivery stage. The goods are used up. */
export function deliverContract(
  state: GameState,
  contractId: number,
  sectionId: number,
): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const c = state.contracts.find((x) => x.id === contractId);
  if (!c) return fail('UNKNOWN_ID');
  const stage = c.stages[c.stageIndex];
  if (c.status !== 'active' || stage?.kind !== 'deliver') return fail('NOT_ACTIVE');
  const depot = sectionState(state, sectionId)?.depot;
  if (!depot) return fail('NOT_OWNED');
  let moved = 0;
  for (const [g, need] of Object.entries(stage.needKg) as [GoodId, number][]) {
    const kg = Math.min(need - (stage.doneKg[g] ?? 0), depot[g] ?? 0);
    if (kg <= 0) continue;
    take(depot, g, kg);
    stage.doneKg[g] = (stage.doneKg[g] ?? 0) + kg;
    moved += kg;
  }
  if (!moved) return fail('INSUFFICIENT_STOCK');
  const entries = Object.entries(stage.needKg) as [GoodId, number][];
  if (entries.every(([g, need]) => (stage.doneKg[g] ?? 0) >= need)) advance(state, c);
  return OK;
}

export function abandonContract(state: GameState, contractId: number): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const c = state.contracts.find((x) => x.id === contractId);
  if (!c) return fail('UNKNOWN_ID');
  if (c.status !== 'active') return fail('NOT_ACTIVE');
  c.status = 'abandoned';
  changeReputation(state, -ABANDON_REP);
  closeSite(state, c);
  return OK;
}

/** Build stages gain the engineers at work; staff stages gain time while the crew is complete. */
function progress(state: GameState, c: Contract, hours: number): void {
  const stage = c.stages[c.stageIndex];
  const site = siteOf(state, c);
  if (!stage || stage.kind === 'deliver' || !site) return;
  const crew = presentCrew(state, site.id);
  if (stage.kind === 'build') {
    stage.done += crew.engineer * hours;
    if (stage.done >= stage.engineerHours) advance(state, c);
  } else if (crew.technician >= stage.technicians) {
    stage.done += hours;
    if (stage.done >= stage.hours) advance(state, c);
  }
}

function complete(state: GameState, ctx: StepContext, c: Contract): void {
  c.status = 'completed';
  transfer(state.ledger, 'world', 'player', c.rewardCents);
  state.stats.incomeCents += c.rewardCents;
  changeReputation(state, c.repGain);
  if (c.plotId !== null && c.asset) state.clientAssets.push({ plotId: c.plotId, asset: c.asset });
  closeSite(state, c);
  state.colonyPop += ctx.rng.int(40, 120);
  ctx.events.push({ t: 'income', plotId: c.plotId, cents: c.rewardCents, source: 'contract' });
  ctx.events.push({ t: 'contractCompleted', contractId: c.id });
}

function failContract(state: GameState, ctx: StepContext, c: Contract): void {
  c.status = 'failed';
  changeReputation(state, -c.repLoss);
  closeSite(state, c);
  ctx.events.push({ t: 'contractFailed', contractId: c.id });
}

export const contractsSystem: System = {
  id: 'contracts',
  step(state, ctx) {
    const now = state.tick;
    for (const c of state.contracts) {
      if (c.status !== 'active') continue;
      progress(state, c, ctx.dtMinutes / 60);
      if (c.stageIndex >= c.stages.length) complete(state, ctx, c);
      else if (now > c.deadlineTick) failContract(state, ctx, c);
    }
    state.contracts = state.contracts.filter((c) => c.status !== 'offered' || now < c.deadlineTick);
    if (now % 60 === 0) {
      const onBoard = state.contracts.filter((c) => c.status === 'offered').length;
      if (onBoard < boardSize(state.reputation) && ctx.rng.next() < 0.25) {
        const c = generateOffer(state, ctx.rng);
        state.contracts.push(c);
        ctx.events.push({ t: 'contractOffered', contractId: c.id });
      }
    }
    const finished = state.contracts.filter((c) => c.status !== 'offered' && c.status !== 'active');
    if (finished.length > FINISHED_KEPT) {
      const old = new Set(finished.slice(0, finished.length - FINISHED_KEPT));
      state.contracts = state.contracts.filter((c) => !old.has(c));
    }
  },
};

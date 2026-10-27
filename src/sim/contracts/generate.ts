import { WAGE_CENTS_PER_DAY } from '../../data/balance';
import { BUILDINGS } from '../../data/buildings';
import type { Rng } from '../rng';
import { newId, type GameState } from '../state';
import { worldOf } from '../world/luna';
import type { Plot, RawGoodId } from '../world/types';
import type { Asset, Contract, Issuer } from './contracts';
import { infrastructureReward, oreDeliveryReward } from './rewards';

const ORE_WEIGHTS: [RawGoodId, number][] = [
  ['regolith', 3],
  ['ilmenite', 3],
  ['anorthite', 2],
  ['polarVolatiles', 2],
  ['kreep', 1],
  ['helium3', 0.3],
];
const ISSUERS: Issuer[] = ['Lunar Authority', 'Shackleton Colony', 'Peary Settlement'];
const ASSETS: Asset[] = ['landingPad', 'commMast', 'roadDepot', 'publicSolar'];
/** Share of offers that are infrastructure, while a public plot is free. */
const INFRASTRUCTURE_SHARE = 0.3;
const OFFER_HOURS = 48;

const uniform = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.next();

function weighted<T>(rng: Rng, items: [T, number][]): T {
  let r = rng.next() * items.reduce((sum, [, w]) => sum + w, 0);
  for (const [item, w] of items) if ((r -= w) < 0) return item;
  return items[items.length - 1]![0];
}

/** The level-1 extraction rate of the building that mines a good, in tonnes per hour. */
function refRateTph(good: RawGoodId): number {
  let best = 0;
  for (const def of Object.values(BUILDINGS)) {
    if (def.depositGoods.includes(good)) {
      best = Math.max(best, def.extractTph * (def.yieldFactor[good] ?? 1));
    }
  }
  return best;
}

/** Public plots in owned sections with no building, client asset or open contract on them. */
export function freePublicPlots(state: GameState): Plot[] {
  const owned = new Set(state.sections.map((s) => s.id));
  const taken = new Set<number | null>([
    ...state.buildings.map((b) => b.plotId),
    ...state.clientAssets.map((a) => a.plotId),
    ...state.contracts
      .filter((c) => c.status === 'offered' || c.status === 'active')
      .map((c) => c.plotId),
  ]);
  return worldOf(state).plots.filter(
    (p) => p.kind === 'public' && owned.has(p.sectionId) && !taken.has(p.id),
  );
}

/** A new offer for the board: ore delivery, or infrastructure on a free public plot. */
export function generateOffer(state: GameState, rng: Rng): Contract {
  const common = {
    id: newId(state),
    issuer: rng.pick(ISSUERS),
    status: 'offered' as const,
    offeredTick: state.tick,
    deadlineTick: state.tick + OFFER_HOURS * 60,
    stageIndex: 0,
  };
  const plots = freePublicPlots(state);
  if (plots.length && rng.next() < INFRASTRUCTURE_SHARE) {
    const plot = rng.pick(plots);
    const asset = rng.pick(ASSETS);
    const prefabT = Math.round(uniform(rng, 20, 60));
    const steelT = Math.round(uniform(rng, 5, 15));
    const engineerHours = Math.round(uniform(rng, 48, 144));
    const hours = rng.int(72, 168);
    const margin = uniform(rng, 1.2, 1.5);
    const materialsCents =
      prefabT * state.market.prefabStructures.pRefCents + steelT * state.market.steel.pRefCents;
    const labourCents =
      (engineerHours * WAGE_CENTS_PER_DAY.engineer + 48 * WAGE_CENTS_PER_DAY.technician) / 24;
    return {
      ...common,
      type: 'infrastructure',
      hours,
      rewardCents: infrastructureReward({
        materialsCents,
        labourCents,
        margin,
        deadlineHours: hours,
        reputation: state.reputation,
      }),
      repGain: 5,
      repLoss: 8,
      stages: [
        {
          kind: 'deliver',
          needKg: { prefabStructures: prefabT * 1000, steel: steelT * 1000 },
          doneKg: {},
        },
        { kind: 'build', engineerHours, done: 0 },
        { kind: 'staff', technicians: 2, hours: 24, done: 0 },
      ],
      plotId: plot.id,
      asset,
    };
  }
  const good = weighted(rng, ORE_WEIGHTS);
  const amountT =
    good === 'helium3'
      ? Math.round(uniform(rng, 0.05, 0.3) * 100) / 100
      : Math.round(uniform(rng, 30, 150));
  const hours = Math.ceil((amountT / refRateTph(good)) * uniform(rng, 1.5, 3)) + 24;
  const margin = uniform(rng, 1.1, 1.3);
  return {
    ...common,
    type: 'oreDelivery',
    hours,
    rewardCents: oreDeliveryReward({
      amountT,
      pRefCents: state.market[good].pRefCents,
      margin,
      deadlineHours: hours,
      reputation: state.reputation,
    }),
    repGain: 3,
    repLoss: 5,
    stages: [{ kind: 'deliver', needKg: { [good]: Math.round(amountT * 1000) }, doneKg: {} }],
    plotId: null,
    asset: null,
  };
}

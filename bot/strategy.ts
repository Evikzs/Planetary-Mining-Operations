import { levelOutput, NEEDS_KG_PER_DAY } from '../src/data/balance';
import { BUILDINGS, RECIPES, type BuildingTypeId, type RecipeId } from '../src/data/buildings';
import { GOOD_IDS, GOODS, type GoodId } from '../src/data/goods';
import { plotOccupied } from '../src/sim/build/construction';
import { buyableSections, landPrice } from '../src/sim/build/landOffice';
import type { Command } from '../src/sim/commands';
import { maxActive } from '../src/sim/contracts/rewards';
import { applyCommand, createGame, step } from '../src/sim/engine';
import { balance } from '../src/sim/ledger';
import { housingCapacity, residentsBySection } from '../src/sim/people/housing';
import { slotsPerShift, staffing } from '../src/sim/people/jobs';
import type { GameState, SectionState } from '../src/sim/state';
import { worldOf } from '../src/sim/world/luna';
import type { RawGoodId } from '../src/sim/world/types';

interface Plan {
  type: BuildingTypeId;
  deposit?: RawGoodId;
  recipeId?: RecipeId;
}

const BUILD_ORDER: Plan[] = [
  { type: 'mine', deposit: 'ilmenite' },
  { type: 'iceDrill', deposit: 'polarVolatiles' },
  { type: 'waterPlant' },
  { type: 'crewQuarters' },
  { type: 'smelter', recipeId: 'steel' },
  { type: 'solarArray' },
  { type: 'hydroponicsFarm' },
  { type: 'chemicalRefinery', recipeId: 'fertiliser' },
  { type: 'habitatDome' },
  { type: 'solarArray' },
  { type: 'mine', deposit: 'anorthite' },
];
/** Land waits until this much of the build order stands. */
const BUILT_BEFORE_LAND = 5;

const NEEDS: [GoodId, number][] = [
  ['oxygen', NEEDS_KG_PER_DAY.oxygen],
  ['potableWater', NEEDS_KG_PER_DAY.potableWater],
  ['hydroponicProduce', NEEDS_KG_PER_DAY.hydroponicProduce],
];
/** Raw ore kept to fill delivery contracts, in kg. */
const ORE_RESERVE = 150_000;
const RAW = new Set<GoodId>([
  'regolith',
  'ilmenite',
  'anorthite',
  'helium3',
  'kreep',
  'polarVolatiles',
]);
/** Buys never pay more than this many times the curve centre. */
const BUY_LIMIT = 2;
/** Cash kept back from building for wages, in cents. */
const CASH_FLOOR = 2_000_000;

const cash = (s: GameState) => balance(s.ledger, 'player');
const stock = (sec: SectionState, g: GoodId) => sec.depot[g] ?? 0;
const hasOrder = (s: GameState, g: GoodId, side: 'buy' | 'sell') =>
  s.orders.some((o) => o.goodId === g && o.side === side);
const buy = (s: GameState, g: GoodId, kg: number, sectionId: number): Command => ({
  t: 'placeOrder',
  goodId: g,
  side: 'buy',
  kind: 'limit',
  qtyKg: Math.ceil(kg),
  limitCents: Math.round(BUY_LIMIT * s.market[g].pRefCents),
  sectionId,
});

/** Index in BUILD_ORDER of the first planned building that does not stand yet. */
function planIndex(s: GameState): number {
  const plots = worldOf(s).plots;
  const used = new Set<number>();
  return BUILD_ORDER.findIndex((plan) => {
    const match = s.buildings.find(
      (b) =>
        !used.has(b.id) &&
        b.type === plan.type &&
        (!plan.deposit || plots[b.plotId]?.deposit?.goodId === plan.deposit),
    );
    if (match) used.add(match.id);
    return !match;
  });
}

const hasJobs = (type: BuildingTypeId) => Object.keys(BUILDINGS[type].jobs).length > 0;

/** Job slots nobody fills, idle workers and empty beds, company-wide. */
function workforce(s: GameState): { open: number; idle: number; beds: number } {
  let slots = 0;
  let beds = 0;
  for (const b of s.buildings) {
    beds += housingCapacity(b);
    if (b.status === 'constructing') continue;
    for (const n of Object.values(slotsPerShift(b))) slots += 3 * n;
  }
  const p = s.people;
  let employed = 0;
  for (let i = 0; i < p.count; i++) if (p.job[i]! >= 0) employed++;
  return { open: slots - employed, idle: p.count - employed, beds: beds - p.count };
}

/**
 * The next building. Homes come first when jobs outnumber the people to fill them, an array when
 * a staffed grid browns out; otherwise the build order, but no new jobs nobody could take.
 */
function nextPlan(s: GameState): Plan | undefined {
  const goingUp = (type: BuildingTypeId) =>
    s.buildings.some((b) => b.type === type && b.status === 'constructing');
  const { open, idle, beds } = workforce(s);
  if (open > idle && beds <= 0 && !goingUp('crewQuarters')) return { type: 'crewQuarters' };
  // A bare depot with no generation is no brownout, and an array nobody staffs adds nothing.
  const browned = s.sections.some((sec) => sec.power.factor < 1 && sec.power.supplyKw > 0);
  const arraysStaffed = s.buildings
    .filter((b) => b.type === 'solarArray' && b.status !== 'constructing')
    .every((b) => staffing(s, b) === 1);
  if (browned && arraysStaffed && !goingUp('solarArray')) return { type: 'solarArray' };
  const i = planIndex(s);
  const plan = i < 0 ? undefined : BUILD_ORDER[i];
  if (plan && hasJobs(plan.type) && open > idle + Math.max(0, beds)) return undefined;
  return plan;
}

function build(s: GameState, plan: Plan): Command[] {
  // Where people live first: the founding section, then the rest.
  const residents = residentsBySection(s);
  const owned = [...s.sections].sort(
    (a, b) => (residents.get(b.id) ?? 0) - (residents.get(a.id) ?? 0),
  );
  const plots = worldOf(s).plots;
  const plot = owned
    .map((sec) =>
      plots.find(
        (p) =>
          p.sectionId === sec.id &&
          !plotOccupied(s, p.id) &&
          (plan.deposit ? p.deposit?.goodId === plan.deposit : p.kind === 'build'),
      ),
    )
    .find((p) => p !== undefined);
  if (!plot) return [];
  const def = BUILDINGS[plan.type];
  const sec = s.sections.find((x) => x.id === plot.sectionId)!;
  const missing = (Object.entries(def.cost.materials) as [GoodId, number][])
    .map(([g, t]) => [g, t * 1000 - stock(sec, g)] as const)
    .filter(([, kg]) => kg > 0);
  if (!missing.length) {
    return cash(s) >= def.cost.cents + CASH_FLOOR
      ? [{ t: 'build', plotId: plot.id, type: plan.type, recipeId: plan.recipeId }]
      : [];
  }
  return missing
    .filter(([g]) => !hasOrder(s, g, 'buy'))
    .map(([g, kg]) => buy(s, g, Math.ceil(kg / 1000) * 1000, sec.id));
}

/** What a section keeps of a good it makes: two days of needs and inputs, and ore for contracts. */
function reserveKg(s: GameState, sec: SectionState, g: GoodId, residents: number): number {
  let kg = 0;
  for (const [need, perDay] of NEEDS) if (need === g) kg += 2 * perDay * residents;
  if (RAW.has(g)) kg += g === 'helium3' ? 300 : ORE_RESERVE;
  for (const b of s.buildings) {
    const input = b.sectionId === sec.id && b.recipeId ? RECIPES[b.recipeId].inputs[g] : undefined;
    if (input) kg += input * levelOutput(b.level) * 48 * 1000;
  }
  return kg;
}

/** Keeps two days of needs in every lived-in depot and sells the surplus of what it makes. */
function trade(s: GameState): Command[] {
  const cmds: Command[] = [];
  const residents = residentsBySection(s);
  for (const sec of s.sections) {
    const people = residents.get(sec.id) ?? 0;
    for (const [g, perDay] of NEEDS) {
      if (stock(sec, g) < 2 * perDay * people && !hasOrder(s, g, 'buy')) {
        cmds.push(buy(s, g, 3 * perDay * people - stock(sec, g), sec.id));
      }
    }
    for (const g of GOOD_IDS) {
      if (!s.stats.producedKg[g] || hasOrder(s, g, 'sell')) continue; // sells only what it makes
      const excess = stock(sec, g) - reserveKg(s, sec, g, people);
      // A quarter of the colony's hourly volume at most, to keep the price up.
      const kg = Math.min(Math.floor(excess), Math.round(GOODS[g].npc.volumeTph * 250));
      if (kg >= 1000) {
        cmds.push({
          t: 'placeOrder',
          goodId: g,
          side: 'sell',
          kind: 'market',
          qtyKg: kg,
          sectionId: sec.id,
        });
      }
    }
  }
  return cmds;
}

/** Takes ore deliveries the depots can fill now and hands the ore over. */
function contracts(s: GameState): Command[] {
  const cmds: Command[] = [];
  let active = s.contracts.filter((c) => c.status === 'active').length;
  for (const c of s.contracts) {
    const stage = c.stages[c.stageIndex];
    if (c.type !== 'oreDelivery' || stage?.kind !== 'deliver') continue;
    const [g, need] = Object.entries(stage.needKg)[0] as [GoodId, number];
    const left = need - (stage.doneKg[g] ?? 0);
    const source = [...s.sections].sort((a, b) => stock(b, g) - stock(a, g))[0];
    if (!source || stock(source, g) <= 0) continue;
    if (c.status === 'offered') {
      if (stock(source, g) < left || active >= maxActive(s.reputation)) continue;
      cmds.push({ t: 'acceptContract', contractId: c.id });
      active++;
    } else if (c.status !== 'active') continue;
    cmds.push({ t: 'deliverContract', contractId: c.id, sectionId: source.id });
  }
  return cmds;
}

function expand(s: GameState): Command[] {
  if (s.sections.length >= 6 || cash(s) <= 1.5 * landPrice(s.landPurchases)) return [];
  const i = planIndex(s);
  if (i >= 0 && i < BUILT_BEFORE_LAND) return [];
  const plots = worldOf(s).plots;
  const options = buyableSections(s);
  const wanted = options.find((id) =>
    plots.some((p) => p.sectionId === id && p.deposit?.goodId === 'anorthite'),
  );
  const sectionId = wanted ?? options[0];
  return sectionId === undefined ? [] : [{ t: 'buySection', sectionId }];
}

/** Power comes first: arrays get their technicians before anything else does. */
function powerFirst(s: GameState): Command[] {
  return s.buildings
    .filter((b) => b.type === 'solarArray' && b.priority !== 'high')
    .map((b) => ({ t: 'setPriority', buildingId: b.id, priority: 'high' }));
}

/** One hour's decisions: build, power priority, contracts, trade, land. */
export function botDecide(s: GameState): Command[] {
  const plan = nextPlan(s);
  return [
    ...(plan ? build(s, plan) : []),
    ...powerFirst(s),
    ...contracts(s),
    ...trade(s),
    ...expand(s),
  ];
}

export interface BotResult {
  sections: number;
  activeSmelters: number;
  population: number;
  contractsCompleted: number;
  cashCents: number;
  /** Longest run of hours any section spent with air or water under 90% met. */
  worstLifeSupportHours: number;
}

export function runBot(seed: number, hours: number): BotResult {
  const s = createGame(seed);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  let completed = 0;
  let worst = 0;
  const streak = new Map<number, number>();
  for (let h = 0; h < hours; h++) {
    for (const cmd of botDecide(s)) applyCommand(s, cmd);
    for (const e of step(s, { mode: 'coarse' })) if (e.t === 'contractCompleted') completed++;
    for (const sec of s.sections) {
      const short = sec.needsMet.air < 0.9 || sec.needsMet.water < 0.9;
      const run = short ? (streak.get(sec.id) ?? 0) + 1 : 0;
      streak.set(sec.id, run);
      worst = Math.max(worst, run);
    }
  }
  return {
    sections: s.sections.length,
    activeSmelters: s.buildings.filter((b) => b.type === 'smelter' && b.status === 'active').length,
    population: s.people.count,
    contractsCompleted: completed,
    cashCents: cash(s),
    worstLifeSupportHours: worst,
  };
}

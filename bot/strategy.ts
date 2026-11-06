import { levelOutput, NEEDS_KG_PER_DAY, upgradeCost } from '../src/data/balance';
import { AUCTION } from '../src/data/auctions';
import { BUILDINGS, RECIPES, type BuildingTypeId, type RecipeId } from '../src/data/buildings';
import { MIN_LOAN_CENTS } from '../src/data/finance';
import { GOOD_IDS, GOODS, type GoodId } from '../src/data/goods';
import { minBidCents } from '../src/sim/auctions';
import { plotOccupied } from '../src/sim/build/construction';
import type { Command } from '../src/sim/commands';
import { cashAccount, PLAYER, playerCompany, type CompanyId } from '../src/sim/companies';
import { maxActive } from '../src/sim/contracts/rewards';
import { applyCommand, createGame, step } from '../src/sim/engine';
import { assets, liabilities } from '../src/sim/finance/books';
import { loansOf } from '../src/sim/finance/credit';
import { balance } from '../src/sim/ledger';
import { housingCapacity, residentsBySection } from '../src/sim/people/housing';
import { slotsPerShift, staffing } from '../src/sim/people/jobs';
import { headroomCents, sectionValueCents } from '../src/sim/rivals/valuation';
import type { Building, GameState, SectionState } from '../src/sim/state';
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

/** Most sections the bot bids for. */
const MAX_SECTIONS = 4;
/** Cash a land bid leaves for wages and builds, in cents. */
const BID_RESERVE = 2_000_000;
const LOAN_STEP = 1_000_000;
/** Ratings good enough to borrow at, and the most debt per unit of equity. */
const BORROW_RATINGS = new Set(['AAA', 'AA', 'A', 'BBB']);
const MAX_DEBT_TO_EQUITY = 0.5;

const cash = (s: GameState) => balance(s.ledger, cashAccount(PLAYER));
const stock = (sec: SectionState, g: GoodId) => sec.depot[g] ?? 0;
const hasOrder = (s: GameState, g: GoodId, side: 'buy' | 'sell') =>
  s.orders.some((o) => o.companyId === PLAYER && o.goodId === g && o.side === side);
/** The bot sees only what is its own: rivals share the Moon. */
const mySections = (s: GameState) => s.sections.filter((x) => x.owner === PLAYER);
function myBuildings(s: GameState): Building[] {
  const ids = new Set(mySections(s).map((x) => x.id));
  return s.buildings.filter((b) => ids.has(b.sectionId));
}
const equityOf = (s: GameState, co: CompanyId) => assets(s, co).total - liabilities(s, co);
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
  const mine = myBuildings(s);
  return BUILD_ORDER.findIndex((plan) => {
    const match = mine.find(
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
  const mine = myBuildings(s);
  for (const b of mine) {
    beds += housingCapacity(b);
    if (b.status === 'constructing') continue;
    for (const n of Object.values(slotsPerShift(b))) slots += 3 * n;
  }
  const homes = new Set(mine.map((b) => b.id));
  const p = s.people;
  let people = 0;
  let employed = 0;
  for (let i = 0; i < p.count; i++) {
    if (!homes.has(p.home[i]!)) continue;
    people++;
    if (p.job[i]! >= 0) employed++;
  }
  return { open: slots - employed, idle: people - employed, beds: beds - people };
}

/**
 * The next building. Homes come first when jobs outnumber the people to fill them, an array when
 * a staffed grid browns out; otherwise the build order, but no new jobs nobody could take.
 */
function nextPlan(s: GameState): Plan | undefined {
  const mine = myBuildings(s);
  const goingUp = (type: BuildingTypeId) =>
    mine.some((b) => b.type === type && b.status === 'constructing');
  const { open, idle, beds } = workforce(s);
  if (open > idle && beds <= 0 && !goingUp('crewQuarters')) return { type: 'crewQuarters' };
  const i = planIndex(s);
  const plan = i < 0 ? undefined : BUILD_ORDER[i];
  if (plan && hasJobs(plan.type) && open > idle + Math.max(0, beds)) return undefined;
  return plan;
}

function build(s: GameState, plan: Plan): Command[] {
  // Where people live first: the founding section, then the rest.
  const residents = residentsBySection(s);
  const owned = mySections(s).sort(
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
    if (cash(s) >= def.cost.cents + CASH_FLOOR) {
      return [{ t: 'build', plotId: plot.id, type: plan.type, recipeId: plan.recipeId }];
    }
    return borrow(s, def.cost.cents + CASH_FLOOR - cash(s));
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
  for (const sec of mySections(s)) {
    const people = residents.get(sec.id) ?? 0;
    // Air, water and food at market, whatever they cost: a limit can leave a section dry.
    for (const [g, perDay] of NEEDS) {
      const ordered = s.orders.some(
        (o) =>
          o.companyId === PLAYER && o.sectionId === sec.id && o.goodId === g && o.side === 'buy',
      );
      if (stock(sec, g) < 2 * perDay * people && !ordered) {
        cmds.push({
          t: 'placeOrder',
          goodId: g,
          side: 'buy',
          kind: 'market',
          qtyKg: Math.ceil(3 * perDay * people - stock(sec, g)),
          sectionId: sec.id,
        });
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
  let active = s.contracts.filter((c) => c.status === 'active' && c.holder === PLAYER).length;
  for (const c of s.contracts) {
    const stage = c.stages[c.stageIndex];
    if (c.type !== 'oreDelivery' || stage?.kind !== 'deliver') continue;
    if (c.status === 'active' && c.holder !== PLAYER) continue;
    const [g, need] = Object.entries(stage.needKg)[0] as [GoodId, number];
    const left = need - (stage.doneKg[g] ?? 0);
    const source = mySections(s).sort((a, b) => stock(b, g) - stock(a, g))[0];
    if (!source || stock(source, g) <= 0) continue;
    if (c.status === 'offered') {
      if (stock(source, g) < left || active >= maxActive(playerCompany(s)!.reputation.luna))
        continue;
      cmds.push({ t: 'acceptContract', contractId: c.id });
      active++;
    } else if (c.status !== 'active') continue;
    cmds.push({ t: 'deliverContract', contractId: c.id, sectionId: source.id });
  }
  return cmds;
}

/**
 * Land by auction, once the base stands: a lot of its own on the best free neighbour (anorthite
 * first) and a proxy on any open lot next to its land, at most 1.5x ten days of the section's
 * deposits and never the cash it needs to keep going. One proxy at a time.
 */
function expand(s: GameState): Command[] {
  const sections = mySections(s);
  if (sections.length >= MAX_SECTIONS) return [];
  const i = planIndex(s);
  if (i >= 0 && i < BUILT_BEFORE_LAND) return [];
  const world = worldOf(s);
  const owned = new Set(s.sections.map((x) => x.id));
  const near = new Set(
    sections.flatMap((x) => world.sections[x.id]!.neighbors).filter((id) => !owned.has(id)),
  );
  const open = s.auctions.filter((a) => a.status === 'open');
  const cmds: Command[] = [];
  if (!open.some((a) => a.proxies.some((p) => p.companyId === PLAYER))) {
    const lot = open.find((a) => a.lot.kind === 'section' && near.has(a.lot.sectionId));
    if (lot) {
      const ceiling = Math.floor(
        Math.min(
          1.5 * sectionValueCents(s, lot.lot.sectionId, AUCTION.valueHorizonDays),
          headroomCents(s, PLAYER) - BID_RESERVE,
        ),
      );
      if (ceiling >= minBidCents(s, lot, PLAYER)) {
        cmds.push({ t: 'setProxy', auctionId: lot.id, ceilingCents: ceiling });
      }
    }
  }
  if (!open.some((a) => a.openedBy === PLAYER)) {
    const free = [...near].filter((id) => !open.some((a) => a.lot.sectionId === id));
    const anorthite = free.find((id) =>
      world.plots.some((p) => p.sectionId === id && p.deposit?.goodId === 'anorthite'),
    );
    const best = [...free].sort(
      (a, b) =>
        sectionValueCents(s, b, AUCTION.valueHorizonDays) -
          sectionValueCents(s, a, AUCTION.valueHorizonDays) || a - b,
    )[0];
    const sectionId = anorthite ?? best;
    if (sectionId !== undefined) cmds.push({ t: 'openAuction', sectionId });
  }
  return cmds;
}

/** A 6-month loan for a build that lacks cash, at a fair rating and modest debt. */
function borrow(s: GameState, shortCents: number): Command[] {
  const c = playerCompany(s)!;
  const equity = equityOf(s, PLAYER);
  const debt = loansOf(s, PLAYER) + c.credit.creditDrawnCents;
  if (!BORROW_RATINGS.has(c.credit.rating) || debt >= MAX_DEBT_TO_EQUITY * equity) return [];
  const amountCents = Math.max(MIN_LOAN_CENTS, Math.ceil(shortCents / LOAN_STEP) * LOAN_STEP);
  return [{ t: 'takeLoan', amountCents, months: 6 }];
}

/** Loans and the drawn credit line go back once cash is twice what they are. */
function repay(s: GameState): Command[] {
  const drawn = playerCompany(s)!.credit.creditDrawnCents;
  const cmds: Command[] = s.loans
    .filter((l) => l.companyId === PLAYER && cash(s) > 2 * l.principalCents)
    .map((l) => ({ t: 'repayLoan', loanId: l.id, amountCents: l.principalCents }));
  if (drawn > 0 && cash(s) > 2 * drawn) cmds.push({ t: 'repayCredit', amountCents: drawn });
  return cmds;
}

/**
 * Power is per section: one that browns out with all its arrays staffed gets another array there,
 * or, with no free plot, its smallest array upgraded. A bare depot with no generation is no
 * brownout, and an array nobody staffs adds nothing.
 */
function power(s: GameState): Command[] {
  const mine = myBuildings(s);
  for (const sec of mySections(s)) {
    if (sec.power.factor >= 1 || sec.power.supplyKw === 0) continue;
    const arrays = mine.filter((b) => b.sectionId === sec.id && b.type === 'solarArray');
    if (arrays.some((b) => b.status !== 'active' || staffing(s, b) < 1)) continue;
    const plot = worldOf(s).plots.find(
      (p) => p.sectionId === sec.id && p.kind === 'build' && !plotOccupied(s, p.id),
    );
    const smallest = [...arrays].sort((a, b) => a.level - b.level || a.id - b.id)[0];
    const def = BUILDINGS.solarArray;
    const cost = plot ? def.cost : smallest && upgradeCost(def, smallest.level);
    if (!cost) continue;
    const short = (Object.entries(cost.materials) as [GoodId, number][]).filter(
      ([g, t]) => stock(sec, g) < t * 1000,
    );
    if (short.length) {
      return short
        .filter(([g]) => !hasOrder(s, g, 'buy'))
        .map(([g, t]) => buy(s, g, Math.ceil(t) * 1000, sec.id));
    }
    if (cash(s) < cost.cents + CASH_FLOOR) return borrow(s, cost.cents + CASH_FLOOR - cash(s));
    return [
      plot
        ? { t: 'build', plotId: plot.id, type: 'solarArray' }
        : { t: 'upgrade', buildingId: smallest!.id },
    ];
  }
  return [];
}

/** Power comes first: arrays get their technicians before anything else does. */
function powerFirst(s: GameState): Command[] {
  return myBuildings(s)
    .filter((b) => b.type === 'solarArray' && b.priority !== 'high')
    .map((b) => ({ t: 'setPriority', buildingId: b.id, priority: 'high' }));
}

/** One hour's decisions: build, power priority, contracts, trade, land. */
export function botDecide(s: GameState): Command[] {
  const plan = nextPlan(s);
  return [
    ...power(s),
    ...(plan ? build(s, plan) : []),
    ...powerFirst(s),
    ...contracts(s),
    ...trade(s),
    ...expand(s),
    ...repay(s),
  ];
}

export interface BotResult {
  sections: number;
  activeSmelters: number;
  population: number;
  contractsCompleted: number;
  cashCents: number;
  /** Longest run of hours any of its sections spent with air or water under 90% met. */
  worstLifeSupportHours: number;
  /** Lots it won that a rival bid on too. */
  auctionsWonAgainstRivals: number;
  /** Equity at the end over equity at founding. */
  equityGrowth: number;
  activeRivals: number;
  rivalsWithoutSection: number;
  /** Each rival still trading: equity at the end over equity at founding. */
  rivalEquityGrowth: number[];
}

export function runBot(seed: number, hours: number): BotResult {
  const s = createGame(seed);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  const founding = new Map(s.companies.map((c) => [c.id, equityOf(s, c.id)]));
  let completed = 0;
  let won = 0;
  let worst = 0;
  const streak = new Map<number, number>();
  for (let h = 0; h < hours; h++) {
    for (const cmd of botDecide(s)) applyCommand(s, cmd);
    for (const e of step(s, { mode: 'coarse' })) {
      if (e.t === 'contractCompleted' && e.companyId === PLAYER) completed++;
      if (e.t === 'auctionWon' && e.companyId === PLAYER) {
        const a = s.auctions.find((x) => x.id === e.auctionId);
        if (a?.bids.some((b) => b.companyId !== PLAYER)) won++;
      }
    }
    for (const sec of mySections(s)) {
      const short = sec.needsMet.air < 0.9 || sec.needsMet.water < 0.9;
      const run = short ? (streak.get(sec.id) ?? 0) + 1 : 0;
      streak.set(sec.id, run);
      worst = Math.max(worst, run);
    }
  }
  const homes = new Set(myBuildings(s).map((b) => b.id));
  let population = 0;
  for (let i = 0; i < s.people.count; i++) if (homes.has(s.people.home[i]!)) population++;
  const rivals = s.companies.filter((c) => c.kind === 'rival' && c.status === 'active');
  const growth = (co: CompanyId) => equityOf(s, co) / (founding.get(co) ?? equityOf(s, co));
  return {
    sections: mySections(s).length,
    activeSmelters: myBuildings(s).filter((b) => b.type === 'smelter' && b.status === 'active')
      .length,
    population,
    contractsCompleted: completed,
    cashCents: cash(s),
    worstLifeSupportHours: worst,
    auctionsWonAgainstRivals: won,
    equityGrowth: growth(PLAYER),
    activeRivals: rivals.length,
    rivalsWithoutSection: rivals.filter((c) => !s.sections.some((x) => x.owner === c.id)).length,
    rivalEquityGrowth: rivals.map((c) => growth(c.id)),
  };
}

import { AUCTION } from '../../data/auctions';
import { levelOutput, WAGE_LEVEL, type WageLevel } from '../../data/balance';
import {
  BUILDINGS,
  RECIPES,
  SKILLS,
  type BuildingTypeId,
  type RecipeId,
} from '../../data/buildings';
import { ARCHETYPES, OFFER_WAIT_HOURS, type ArchetypeWeights } from '../../data/companies';
import { MIN_LOAN_CENTS } from '../../data/finance';
import { GOODS, type GoodId } from '../../data/goods';
import { leadingBid, minBidCents, type Auction } from '../auctions';
import type { Command, CommandResult } from '../commands';
import { cashAccount, type Archetype, type CompanyId, type CompanyState } from '../companies';
import { maxActive } from '../contracts/rewards';
import { applyCommand, type System } from '../engine';
import { assets, liabilities } from '../finance/books';
import { borrowingRoomCents, loanRate, loansOf } from '../finance/credit';
import { listingOf, type Listing } from '../finance/shares';
import { balance } from '../ledger';
import { housingCapacity } from '../people/housing';
import { slotsPerShift } from '../people/jobs';
import { NEEDS } from '../people/needs';
import { hourlyWageCents } from '../people/payroll';
import { SKILL_OF } from '../people/store';
import type { Building, GameState, SectionState } from '../state';
import { worldOf } from '../world/luna';
import type { Plot } from '../world/types';
import {
  EXTRACTORS,
  goodValueCents,
  headroomCents,
  hourlyMarginCents,
  sectionValueCents,
} from './valuation';

/** A command a rival could send, with what it is worth to it, in cents of value a game day. */
export interface Option {
  cmd: Command;
  utility: number;
  why: string;
  /** Cash it spends at once; the decision keeps 3 days of wages in hand. */
  costCents?: number;
  /** Workers the new building needs over three shifts. */
  crew?: number;
}

/** Everything a rival weighs in one decision, worked out once. */
export interface RivalView {
  state: GameState;
  company: CompanyState;
  w: ArchetypeWeights;
  sections: SectionState[];
  buildings: Building[];
  freePlots: Plot[];
  cash: number;
  wagesPerDay: number;
  /** Cash and unused credit less a day of wages: the most it may bid or borrow. */
  headroom: number;
  residents: Map<number, number>;
  idle: number;
  freeBeds: number;
  open: number;
}

export type OptionSource = (v: RivalView) => Option[];

export const ACTIONS_PER_DECISION = 3;

/** Rivals decide at different minutes of the hour: 11, 22, 33, 44, 55. */
export const decisionMinute = (co: CompanyId): number => (co * 11) % 60;

const PRODUCERS: BuildingTypeId[] = [
  'smelter',
  'chemicalRefinery',
  'electrolysisPlant',
  'airPlant',
  'waterPlant',
  'hydroponicsFarm',
  'assemblyWorks',
  'waferFab',
];

/** Goods spent on putting buildings up: a rival keeps these. */
const MATERIALS = new Set<GoodId>(
  Object.values(BUILDINGS).flatMap((b) => Object.keys(b.cost.materials) as GoodId[]),
);

/** Raw ore a depot keeps for delivery contracts, as the M1 bot does. */
const ORE_RESERVE_KG = 150_000;
/** Days of wages a rival keeps in cash through every spend: the credit line can shrink at a close. */
const RESERVE_DAYS = 3;
const LIFE_SUPPORT = 1e9;
const URGENT = 1e8;
/** A free policy change that happens once: it goes ahead of trade and builds. */
const POLICY = 1e7;
const HOUSING = 1e6;
const tonnes = (kg: number) => Math.ceil(kg / 1000) * 1000;

function view(state: GameState, company: CompanyState): RivalView {
  const sections = state.sections.filter((s) => s.owner === company.id);
  const ids = new Set(sections.map((s) => s.id));
  const buildings = state.buildings.filter((b) => ids.has(b.sectionId));
  const occupied = new Set(state.buildings.map((b) => b.plotId));
  const freePlots = worldOf(state).plots.filter(
    (p) =>
      ids.has(p.sectionId) && (p.kind === 'build' || p.kind === 'deposit') && !occupied.has(p.id),
  );
  // One pass over the people: head count, wages and residents of the company's own sections.
  const homeSection = new Map(buildings.map((b) => [b.id, b.sectionId]));
  const residents = new Map<number, number>();
  let workers = 0;
  let employed = 0;
  let wagesPerHour = 0;
  const p = state.people;
  for (let i = 0; i < p.count; i++) {
    const sid = homeSection.get(p.home[i]!);
    if (sid === undefined) continue;
    workers++;
    if (p.job[i]! >= 0) employed++;
    residents.set(sid, (residents.get(sid) ?? 0) + 1);
    wagesPerHour += hourlyWageCents(SKILL_OF[p.skill[i]!]!, company.wageLevel);
  }
  let beds = 0;
  let slots = 0;
  for (const b of buildings) {
    beds += housingCapacity(b);
    if (b.status === 'constructing') continue;
    for (const n of Object.values(slotsPerShift(b))) slots += 3 * n;
  }
  return {
    state,
    company,
    w: ARCHETYPES[company.archetype!],
    sections,
    buildings,
    freePlots,
    cash: balance(state.ledger, cashAccount(company.id)),
    wagesPerDay: wagesPerHour * 24,
    headroom: headroomCents(state, company.id, wagesPerHour),
    residents,
    idle: workers - employed,
    freeBeds: beds - workers,
    open: slots - employed,
  };
}

/** Kg already on order to buy (or sell) in a section. */
function pending(v: RivalView, sectionId: number, g: GoodId, side: 'buy' | 'sell'): number {
  let kg = 0;
  for (const o of v.state.orders) {
    if (
      o.companyId === v.company.id &&
      o.sectionId === sectionId &&
      o.goodId === g &&
      o.side === side
    ) {
      kg += o.qtyKg - o.filledKg;
    }
  }
  return kg;
}

const buy = (sectionId: number, goodId: GoodId, qtyKg: number, limitCents?: number): Command => ({
  t: 'placeOrder',
  goodId,
  side: 'buy',
  kind: limitCents === undefined ? 'market' : 'limit',
  qtyKg,
  limitCents,
  sectionId,
});

/** Air, water and food for three days, before anything else. */
const lifeSupport: OptionSource = (v) =>
  v.sections.flatMap((sec) => {
    const r = v.residents.get(sec.id) ?? 0;
    if (r === 0) return [];
    return NEEDS.flatMap(({ good, kgPerDay }) => {
      const want = 3 * r * kgPerDay;
      const have = (sec.depot[good] ?? 0) + pending(v, sec.id, good, 'buy');
      if (have >= want) return [];
      return [
        {
          cmd: buy(sec.id, good, tonnes(want - have)),
          utility: LIFE_SUPPORT,
          why: `need ${good} ${sec.id}`,
        },
      ];
    });
  });

/** What a section keeps: two days of needs, a stock of raw ore for contracts, 48 h of inputs, materials. */
function reserveKg(v: RivalView, sec: SectionState, g: GoodId): number {
  if (MATERIALS.has(g)) return Infinity;
  const r = v.residents.get(sec.id) ?? 0;
  let keep = 0;
  for (const n of NEEDS) if (n.good === g) keep += 2 * r * n.kgPerDay;
  if (GOODS[g].group === 'raw') keep += g === 'helium3' ? 300 : ORE_RESERVE_KG;
  for (const b of v.buildings) {
    if (b.sectionId !== sec.id || !b.recipeId) continue;
    const t = RECIPES[b.recipeId].inputs[g];
    if (t) keep += t * levelOutput(b.level) * 1000 * 48;
  }
  return keep;
}

/** Stock above what a section keeps goes to market, a quarter of an hour's NPC volume at a time. */
const sellSurplus: OptionSource = (v) =>
  v.sections.flatMap((sec) =>
    (Object.entries(sec.depot) as [GoodId, number][]).flatMap(([g, kg]) => {
      const surplus = kg - reserveKg(v, sec, g);
      if (surplus < 1000 || pending(v, sec.id, g, 'sell') > 0) return [];
      const qty = Math.min(surplus, Math.max(1000, Math.round(GOODS[g].npc.volumeTph * 250)));
      const qtyKg = Math.floor(qty / 1000) * 1000;
      if (qtyKg <= 0) return [];
      return [
        {
          cmd: {
            t: 'placeOrder',
            goodId: g,
            side: 'sell',
            kind: 'market',
            qtyKg,
            sectionId: sec.id,
          },
          utility: (goodValueCents(v.state, g, qtyKg) * v.w.trade) / 10,
          why: `sell ${g} ${sec.id}`,
        } satisfies Option,
      ];
    }),
  );

const NEXT_WAGE: Record<WageLevel, WageLevel> = { low: 'standard', standard: 'high', high: 'high' };

/** A strike raises wages a level; a pirate-linked company goes back to low once crews are content. */
const wages: OptionSource = (v) => {
  const striking = v.buildings.some((b) => b.strike);
  const levels = v.company.wageLevel;
  if (striking) {
    return SKILLS.filter((s) => levels[s] !== 'high').map((skill) => ({
      cmd: { t: 'setWageLevel', skill, level: NEXT_WAGE[levels[skill]] },
      utility: URGENT,
      why: `wage ${skill}`,
    }));
  }
  if (v.company.archetype !== 'pirateLinked') return [];
  const content = averageMorale(v) >= 60;
  return SKILLS.filter((s) => content && levels[s] !== 'low').map((skill) => ({
    cmd: { t: 'setWageLevel', skill, level: 'low' },
    utility: 1000 + WAGE_LEVEL[levels[skill]].factor,
    why: `wage ${skill}`,
  }));
};

function averageMorale(v: RivalView): number {
  const homes = new Set(v.buildings.map((b) => b.id));
  const p = v.state.people;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    if (!homes.has(p.home[i]!)) continue;
    sum += p.morale[i]!;
    n++;
  }
  return n ? sum / n : 100;
}

/** Kg of a good the company holds in its depots, and makes in a day. */
function supply(v: RivalView, g: GoodId): { stock: number; perDay: number } {
  let stock = 0;
  for (const s of v.sections) stock += s.depot[g] ?? 0;
  let perDay = 0;
  for (const b of v.buildings) {
    const def = BUILDINGS[b.type];
    const deposit = worldOf(v.state).plots[b.plotId]?.deposit;
    if (def.extractTph > 0 && deposit?.goodId === g && b.status !== 'constructing') {
      perDay += def.extractTph * deposit.richness * levelOutput(b.level) * 1000 * 24;
    }
  }
  return { stock, perDay };
}

/** Ore deliveries it can fill within a day; deliveries whenever a depot covers a stage. */
const contracts: OptionSource = (v) => {
  const out: Option[] = [];
  const mine = v.state.contracts.filter((c) => c.holder === v.company.id && c.status === 'active');
  // One delivery per depot and decision, earliest deadline first: two would count the same kg.
  const used = new Set<number>();
  const byDeadline = [...mine].sort((a, b) => a.deadlineTick - b.deadlineTick || a.id - b.id);
  for (const c of byDeadline) {
    const stage = c.stages[c.stageIndex];
    if (stage?.kind !== 'deliver') continue;
    for (const sec of v.sections) {
      const moves = (Object.entries(stage.needKg) as [GoodId, number][]).some(
        ([g, need]) => (sec.depot[g] ?? 0) > 0 && need > (stage.doneKg[g] ?? 0),
      );
      if (moves && !used.has(sec.id)) {
        used.add(sec.id);
        out.push({
          cmd: { t: 'deliverContract', contractId: c.id, sectionId: sec.id },
          utility: c.rewardCents,
          why: `deliver ${c.id}`,
        });
      }
    }
  }
  if (mine.length >= maxActive(v.company.reputation.luna)) return out;
  for (const c of v.state.contracts) {
    if (c.status !== 'offered' || c.type !== 'oreDelivery' || c.tenderTo !== null) continue;
    if (v.state.tick - c.offeredTick < OFFER_WAIT_HOURS * 60) continue;
    const stage = c.stages[0];
    if (stage?.kind !== 'deliver') continue;
    const entries = Object.entries(stage.needKg) as [GoodId, number][];
    const fillable = entries.every(([g, need]) => {
      const { stock, perDay } = supply(v, g);
      return stock + perDay >= need;
    });
    if (!fillable) continue;
    const goods = entries.reduce((n, [g, need]) => n + goodValueCents(v.state, g, need), 0);
    out.push({
      cmd: { t: 'acceptContract', contractId: c.id },
      utility: c.rewardCents - goods,
      why: `accept ${c.id}`,
    });
  }
  return out;
};

function plotFor(v: RivalView, sectionId: number | null, kind: Plot['kind']): Plot | undefined {
  return v.freePlots.find(
    (p) => p.kind === kind && (sectionId === null || p.sectionId === sectionId),
  );
}

const building = (v: RivalView, type: BuildingTypeId) =>
  v.buildings.some((b) => b.type === type && b.status === 'constructing');

const crewOf = (type: BuildingTypeId) =>
  Object.values(BUILDINGS[type].jobs).reduce((n, x) => n + 3 * x, 0);

/** Workers a company builds for: idle hands and free beds, times how far ahead it builds. */
const spareCrew = (v: RivalView) => Math.floor((v.idle + Math.max(0, v.freeBeds)) * v.w.expand);

/** A build when the depot holds its materials; else a limit buy of the first one short. */
function buildOrBuy(
  v: RivalView,
  plot: Plot,
  type: BuildingTypeId,
  recipeId: RecipeId | null,
  utility: number,
  why: string,
): Option | null {
  const def = BUILDINGS[type];
  const depot = v.sections.find((s) => s.id === plot.sectionId)!.depot;
  const short = (Object.entries(def.cost.materials) as [GoodId, number][])
    .map(([g, t]) => [g, Math.round(t * 1000) - (depot[g] ?? 0)] as const)
    .find(([, kg]) => kg > 0);
  if (!short) {
    return {
      cmd: { t: 'build', plotId: plot.id, type, recipeId: recipeId ?? undefined },
      utility,
      why: `${why} ${plot.id}`,
      costCents: def.cost.cents,
      crew: crewOf(type),
    };
  }
  const [g, kg] = short;
  if (pending(v, plot.sectionId, g, 'buy') > 0) return null;
  const qty = tonnes(kg);
  return {
    cmd: buy(plot.sectionId, g, qty, Math.round(v.state.market[g].lastCents * 1.2)),
    utility: utility * 0.9,
    why: `materials ${why}`,
    costCents: goodValueCents(v.state, g, qty),
  };
}

/** A section short of power gets a solar array, unless its arrays only lack technicians. */
const power: OptionSource = (v) => {
  if (building(v, 'solarArray')) return [];
  return v.sections.flatMap((sec) => {
    if (sec.power.factor >= 1) return [];
    let fullKw = 0;
    let lost = 0;
    for (const b of v.buildings) {
      if (b.sectionId !== sec.id) continue;
      const kw = BUILDINGS[b.type].powerKw;
      if (kw > 0 && b.status !== 'constructing') fullKw += kw * levelOutput(b.level);
      lost += Math.max(0, hourlyMarginCents(v.state, b.plotId, b.type, b.recipeId));
    }
    // Arrays short of technicians: housing brings them, and another array would not.
    if (fullKw >= sec.power.demandKw) return [];
    const plot = plotFor(v, sec.id, 'build');
    const o =
      plot &&
      buildOrBuy(v, plot, 'solarArray', null, lost * 24 * (1 - sec.power.factor) + 1, 'power');
    return o ? [o] : [];
  });
};

/** More open jobs than idle hands and free beds can fill: crew quarters where most people live. */
const housing: OptionSource = (v) => {
  if (v.open - v.idle <= Math.max(0, v.freeBeds) || building(v, 'crewQuarters')) return [];
  const sec = [...v.sections].sort(
    (a, b) => (v.residents.get(b.id) ?? 0) - (v.residents.get(a.id) ?? 0) || a.id - b.id,
  )[0];
  const plot = sec && (plotFor(v, sec.id, 'build') ?? plotFor(v, null, 'build'));
  const o = plot && buildOrBuy(v, plot, 'crewQuarters', null, HOUSING, 'housing');
  return o ? [o] : [];
};

/** Materials for a build at market value: what a building really costs. */
function buildCostCents(v: RivalView, type: BuildingTypeId): number {
  const def = BUILDINGS[type];
  let cents = def.cost.cents;
  for (const [g, t] of Object.entries(def.cost.materials)) {
    cents += goodValueCents(v.state, g as GoodId, Math.round(t * 1000));
  }
  return cents;
}

/** Extractors on deposits and refineries on build plots, worth their payback; the best plot for each. */
const builds: OptionSource = (v) => {
  const best = new Map<string, Option>();
  const spare = spareCrew(v);
  for (const plot of v.freePlots) {
    const choices: [BuildingTypeId, RecipeId | null][] =
      plot.kind === 'deposit'
        ? EXTRACTORS.filter((t) => BUILDINGS[t].depositGoods.includes(plot.deposit!.goodId)).map(
            (t) => [t, null],
          )
        : PRODUCERS.flatMap((t) =>
            BUILDINGS[t].recipes.map((r) => [t, r] as [BuildingTypeId, RecipeId]),
          );
    for (const [type, recipeId] of choices) {
      const def = BUILDINGS[type];
      if (crewOf(type) > spare) continue;
      const margin = hourlyMarginCents(v.state, plot.id, type, recipeId);
      if (margin <= 0) continue;
      const weight = (def.extractTph > 0 ? v.w.extract : v.w.process) * v.w.expand;
      const utility = margin * 24 * weight - buildCostCents(v, type) / v.w.paybackDays;
      const key = `${type}:${recipeId}`;
      if (utility <= 0 || (best.get(key)?.utility ?? -Infinity) >= utility) continue;
      const o = buildOrBuy(v, plot, type, recipeId, utility, `build ${key}`);
      if (o) best.set(key, o);
    }
  }
  return [...best.values()];
};

/** A refinery's depot holds a day of its inputs; below that it buys two days' worth. */
const recipeInputs: OptionSource = (v) =>
  v.buildings.flatMap((b) => {
    if (!b.recipeId || b.status === 'constructing') return [];
    const margin = Math.max(1, hourlyMarginCents(v.state, b.plotId, b.type, b.recipeId));
    const depot = v.sections.find((s) => s.id === b.sectionId)!.depot;
    return (Object.entries(RECIPES[b.recipeId].inputs) as [GoodId, number][]).flatMap(([g, t]) => {
      const perDay = t * levelOutput(b.level) * 1000 * 24;
      const have = (depot[g] ?? 0) + (b.input[g] ?? 0) + pending(v, b.sectionId, g, 'buy');
      if (have >= perDay) return [];
      const qty = tonnes(2 * perDay - have);
      return [
        {
          cmd: buy(b.sectionId, g, qty, Math.round(v.state.market[g].lastCents * 1.1)),
          utility: margin * 24,
          why: `inputs ${g} ${b.id}`,
          costCents: goodValueCents(v.state, g, qty),
        } satisfies Option,
      ];
    });
  });

/** A lot's worth to a rival: ten days of its deposits' best margins times its appetite for land; on
 * a company's assets, half the buildings' book value as well. */
function lotValueCents(v: RivalView, a: Auction): number {
  let value = sectionValueCents(v.state, a.lot.sectionId, AUCTION.valueHorizonDays) * v.w.expand;
  if (a.lot.kind === 'assets') {
    for (const b of v.state.buildings) {
      if (b.sectionId === a.lot.sectionId) value += 0.5 * b.bookCents;
    }
  }
  return Math.floor(value);
}

/** The most valuable section nobody owns or auctions: next to the company's land when one is. */
function bestFreeSection(v: RivalView, open: Auction[]): number | null {
  const world = worldOf(v.state);
  const taken = new Set([
    ...v.state.sections.map((s) => s.id),
    ...open.map((a) => a.lot.sectionId),
  ]);
  const near = [...new Set(v.sections.flatMap((s) => world.sections[s.id]!.neighbors))].filter(
    (id) => !taken.has(id),
  );
  const pool = near.length ? near : world.sections.map((s) => s.id).filter((id) => !taken.has(id));
  let best: number | null = null;
  let bestValue = -1;
  for (const id of pool.sort((a, b) => a - b)) {
    const value = sectionValueCents(v.state, id, AUCTION.valueHorizonDays);
    if (value > bestValue) {
      best = id;
      bestValue = value;
    }
  }
  return best;
}

/**
 * One proxy a decision, on the open lot worth most over its minimum bid, its ceiling within the
 * cash its other proxies leave; and a lot of its own once its deposits are all built on.
 */
const auctions: OptionSource = (v) => {
  const { state, company } = v;
  const co = company.id;
  const open = state.auctions.filter((a) => a.status === 'open');
  // Land is paid from cash, keeping 3 days of wages: the credit line is for shortfalls.
  let room = Math.min(v.headroom, v.cash - RESERVE_DAYS * v.wagesPerDay);
  for (const a of open) room -= a.proxies.find((p) => p.companyId === co)?.ceilingCents ?? 0;
  let best: Option | undefined;
  for (const a of open) {
    if (a.proxies.some((p) => p.companyId === co) || leadingBid(a)?.companyId === co) continue;
    const value = lotValueCents(v, a);
    const min = minBidCents(state, a, co);
    const ceiling = Math.floor(Math.min(value * v.w.auctionAggression, room));
    if (value <= min || ceiling < min) continue;
    if (best && best.utility >= value - min) continue;
    best = {
      cmd: { t: 'setProxy', auctionId: a.id, ceilingCents: ceiling },
      utility: value - min,
      why: `proxy ${a.id}`,
    };
  }
  const out = best ? [best] : [];
  const mine = open.filter((a) => a.openedBy === co).length;
  const builtOut = !v.freePlots.some((p) => p.kind === 'deposit');
  if (builtOut && mine < AUCTION.maxOpenedPerCompany && v.cash >= 2 * AUCTION.reserveCents) {
    const sid = bestFreeSection(v, open);
    if (sid !== null) {
      out.push({
        cmd: { t: 'openAuction', sectionId: sid },
        utility:
          sectionValueCents(state, sid, AUCTION.valueHorizonDays) * v.w.expand -
          AUCTION.reserveCents,
        why: `open ${sid}`,
        costCents: AUCTION.listingFeeCents,
      });
    }
  }
  return out;
};

/** The best build a decision cannot pay for and keep 3 days of wages: what a loan or an issue funds. */
function buildWaitingOnCash(v: RivalView): Option | undefined {
  let best: Option | undefined;
  for (const o of builds(v))
    if (o.cmd.t === 'build' && (!best || o.utility > best.utility)) best = o;
  return best && v.cash - (best.costCents ?? 0) < RESERVE_DAYS * v.wagesPerDay ? best : undefined;
}

const LOAN_STEP_CENTS = 1_000_000;
/** Archetypes that repay early and buy back cheap shares. */
const PRUDENT = new Set<Archetype>(['cautiousMiner', 'stateBacked']);

/** A 6-month loan for the build that waits on cash, debt within the archetype's D/E; early repayment. */
const debt: OptionSource = (v) => {
  const { state, company } = v;
  const co = company.id;
  const out: Option[] = [];
  const rate = loanRate(company.credit.rating);
  const build = rate === null ? undefined : buildWaitingOnCash(v);
  if (build && rate !== null) {
    const short = (build.costCents ?? 0) + RESERVE_DAYS * v.wagesPerDay - v.cash;
    const amount = Math.max(MIN_LOAN_CENTS, Math.ceil(short / LOAN_STEP_CENTS) * LOAN_STEP_CENTS);
    const equity = assets(state, co).total - liabilities(state, co);
    const debtAfter = loansOf(state, co) + company.credit.creditDrawnCents + amount;
    if (
      debtAfter < v.w.maxDebtToEquity * equity &&
      amount <= v.headroom &&
      amount <= borrowingRoomCents(state, co)
    ) {
      out.push({
        cmd: { t: 'takeLoan', amountCents: amount, months: 6 },
        utility: build.utility - amount * rate * 6,
        why: 'loan',
      });
    }
  }
  // The credit line is for a day's shortfall: what cash beyond 3 days of wages allows goes back.
  const repay = Math.min(company.credit.creditDrawnCents, v.cash - RESERVE_DAYS * v.wagesPerDay);
  if (repay > 0) {
    out.push({
      cmd: { t: 'repayCredit', amountCents: repay },
      utility: POLICY,
      why: 'repay credit',
      costCents: repay,
    });
  }
  if (PRUDENT.has(company.archetype!)) {
    for (const l of state.loans) {
      if (l.companyId !== co || v.cash <= RESERVE_DAYS * v.wagesPerDay + l.principalCents) continue;
      out.push({
        cmd: { t: 'repayLoan', loanId: l.id, amountCents: l.principalCents },
        utility: (l.principalCents * l.ratePerMonth) / 30,
        why: `repay ${l.id}`,
        costCents: l.principalCents,
      });
    }
  }
  return out;
};

const shareBuy = (target: CompanyId, qty: number, l: Listing, why: string): Option => ({
  cmd: { t: 'placeShareOrder', target, side: 'buy', kind: 'limit', qty, limitCents: l.priceCents },
  utility: (l.fvCents - l.priceCents) * qty,
  why,
  costCents: qty * l.priceCents,
});

/** Dividends once a month has closed; buybacks, stock picks and issues by archetype. */
const equity: OptionSource = (v) => {
  const { state, company, w } = v;
  const co = company.id;
  const own = listingOf(state, co);
  if (!own) return [];
  const out: Option[] = [];
  if (company.books.closed.length > 0 && own.dividendRatio !== w.dividendRatio) {
    out.push({
      cmd: { t: 'setDividendRatio', ratio: w.dividendRatio },
      utility: POLICY,
      why: 'dividends',
    });
  }
  const ordered = (target: CompanyId) =>
    state.shareOrders.some((o) => o.companyId === co && o.target === target);
  if (PRUDENT.has(company.archetype!) && own.priceCents < 0.8 * own.fvCents && !ordered(co)) {
    const qty = Math.floor(0.02 * own.outstanding);
    if (v.cash - qty * own.priceCents > 5 * v.wagesPerDay)
      out.push(shareBuy(co, qty, own, 'buyback'));
  }
  if (company.archetype === 'financier') {
    for (const l of state.listings) {
      if (l.companyId === co || ordered(l.companyId)) continue;
      const held =
        state.holdings.find((h) => h.holder === co && h.companyId === l.companyId)?.shares ?? 0;
      const room = Math.floor(0.05 * l.outstanding) - held;
      if (l.priceCents < 0.85 * l.fvCents && room > 0) {
        out.push(shareBuy(l.companyId, room, l, `invest ${l.companyId}`));
      } else if (held > 0 && l.priceCents > 1.15 * l.fvCents) {
        out.push({
          cmd: {
            t: 'placeShareOrder',
            target: l.companyId,
            side: 'sell',
            kind: 'limit',
            qty: held,
            limitCents: l.priceCents,
          },
          utility: (l.priceCents - l.fvCents) * held,
          why: `cash in ${l.companyId}`,
        });
      }
    }
  }
  if (
    company.archetype === 'expander' &&
    own.priceCents > 1.2 * own.fvCents &&
    buildWaitingOnCash(v)
  ) {
    const qty = Math.floor(0.1 * own.outstanding);
    out.push({
      cmd: { t: 'issueShares', qty },
      utility: (own.priceCents - own.fvCents) * qty,
      why: 'issue',
    });
  }
  return out;
};

/** Option sources, in no particular order: the utilities rank them. */
export const OPTION_SOURCES: OptionSource[] = [
  lifeSupport,
  wages,
  contracts,
  power,
  housing,
  builds,
  recipeInputs,
  sellSurplus,
  auctions,
  debt,
  equity,
];

export type Dispatch = (state: GameState, cmd: Command, actor: CompanyId) => CommandResult;

/** One decision: every option, best first, up to three that work, 3 days of wages kept in hand. */
export function decide(state: GameState, company: CompanyState, dispatch: Dispatch): void {
  const v = view(state, company);
  const options = OPTION_SOURCES.flatMap((source) => source(v))
    .filter((o) => o.utility > 0)
    .sort((a, b) => b.utility - a.utility || (a.why < b.why ? -1 : a.why > b.why ? 1 : 0));
  let spent = 0;
  let crew = spareCrew(v);
  let done = 0;
  const bought = new Set<string>();
  for (const o of options) {
    if (done >= ACTIONS_PER_DECISION) break;
    const cost = o.costCents ?? 0;
    if (
      o.utility < LIFE_SUPPORT &&
      cost > 0 &&
      v.cash - spent - cost < RESERVE_DAYS * v.wagesPerDay
    ) {
      continue;
    }
    if ((o.crew ?? 0) > crew) continue;
    // Two builds short of the same material ask for it once.
    const order =
      o.cmd.t === 'placeOrder' ? `${o.cmd.sectionId}:${o.cmd.goodId}:${o.cmd.side}` : '';
    if (order && bought.has(order)) continue;
    bought.add(order);
    if (dispatch(state, o.cmd, company.id).ok) {
      spent += cost;
      crew -= o.crew ?? 0;
      done++;
    }
  }
}

/** The rivals' decision tick: each at its own minute of every hour, or every coarse step. */
export function createRivalsSystem(dispatch?: Dispatch): System {
  return {
    id: 'rivals',
    step(state, ctx) {
      const send = dispatch ?? applyCommand;
      for (const c of state.companies) {
        if (c.kind !== 'rival' || c.status !== 'active' || !c.archetype) continue;
        if (ctx.mode === 'fine' && state.tick % 60 !== decisionMinute(c.id)) continue;
        decide(state, c, send);
      }
    },
  };
}

export const rivalsSystem: System = createRivalsSystem();

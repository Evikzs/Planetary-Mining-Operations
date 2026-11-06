import { levelOutput, WAGE_LEVEL, type WageLevel } from '../../data/balance';
import {
  BUILDINGS,
  RECIPES,
  SKILLS,
  type BuildingTypeId,
  type RecipeId,
} from '../../data/buildings';
import { ARCHETYPES, OFFER_WAIT_HOURS, type ArchetypeWeights } from '../../data/companies';
import { GOODS, type GoodId } from '../../data/goods';
import type { Command, CommandResult } from '../commands';
import { cashAccount, type CompanyId, type CompanyState } from '../companies';
import { maxActive } from '../contracts/rewards';
import { applyCommand, type System } from '../engine';
import { balance } from '../ledger';
import { housingCapacity, residentsBySection } from '../people/housing';
import { slotsPerShift } from '../people/jobs';
import { NEEDS } from '../people/needs';
import { payrollCentsPerHour } from '../people/payroll';
import type { Building, GameState, SectionState } from '../state';
import { worldOf } from '../world/luna';
import type { Plot } from '../world/types';
import { EXTRACTORS, goodValueCents, hourlyMarginCents } from './valuation';

/** A command a rival could send, with what it is worth to it, in cents of value a game day. */
export interface Option {
  cmd: Command;
  utility: number;
  why: string;
  /** Cash it spends at once; the decision keeps a day of wages in hand. */
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
const LIFE_SUPPORT = 1e9;
const URGENT = 1e8;
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
  const homes = new Set(buildings.map((b) => b.id));
  let workers = 0;
  let employed = 0;
  const p = state.people;
  for (let i = 0; i < p.count; i++) {
    if (!homes.has(p.home[i]!)) continue;
    workers++;
    if (p.job[i]! >= 0) employed++;
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
    wagesPerDay: payrollCentsPerHour(state, company.id) * 24,
    residents: residentsBySection(state),
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

/** Option sources, in no particular order: the utilities rank them. C10 appends more. */
export const OPTION_SOURCES: OptionSource[] = [
  lifeSupport,
  wages,
  contracts,
  power,
  housing,
  builds,
  recipeInputs,
  sellSurplus,
];

export type Dispatch = (state: GameState, cmd: Command, actor: CompanyId) => CommandResult;

/** One decision: every option, best first, up to three that work, a day of wages kept in hand. */
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
    if (o.utility < LIFE_SUPPORT && cost > 0 && v.cash - spent - cost < v.wagesPerDay) continue;
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

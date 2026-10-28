import { NARRATOR_LINES } from '../data/companions/narrator';
import { VETERAN_LINES } from '../data/companions/veteran';
import {
  BUILDINGS,
  SKILLS,
  type BuildingTypeId,
  type RecipeId,
  type Skill,
} from '../data/buildings';
import { GOOD_IDS, type GoodId } from '../data/goods';
import type { Trip } from '../shared/trips';
import type { Vec3 } from '../shared/vec3';
import type { Alert } from './alerts';
import { buyableSections, landPrice } from './build/landOffice';
import { productionRateTph } from './build/production';
import { storageCapKg } from './build/sections';
import { formatGameDate, shiftAt } from './clock';
import type { Contract } from './contracts/contracts';
import { totalKg, type Inventory } from './inventory';
import { balance } from './ledger';
import type { Order } from './market/orders';
import { housingCapacity } from './people/housing';
import { slotsPerShift, staffing } from './people/jobs';
import { indexOfId, SKILL_CODE, SKILL_OF, workerName } from './people/store';
import type { Building, BuildingStatus, Company, GameState, Priority } from './state';
import type { BeatId, HintCategory } from './story/beats';
import { currentLine } from './story/story';
import { worldOf } from './world/luna';
import type { PlotKind, RawGoodId } from './world/types';

/** What the renderer draws that changes only when the player builds or expands. */
export interface WorldView {
  version: number;
  seed: number;
  radius: number;
  sections: {
    id: number;
    center: Vec3;
    polygon: Vec3[];
    owner: 'player' | 'authority';
    buyable: boolean;
  }[];
  plots: {
    id: number;
    sectionId: number;
    kind: PlotKind;
    dir: Vec3;
    deposit: { goodId: RawGoodId; richness: number } | null;
  }[];
  buildings: {
    id: number;
    plotId: number;
    type: BuildingTypeId;
    level: number;
    status: BuildingStatus;
    progress: number;
  }[];
  roads: { id: number; sectionId: number; points: Vec3[] }[];
  belts: { id: number; buildingId: number; points: Vec3[]; length: number }[];
  clientAssets: { plotId: number; asset: string }[];
  contractSites: { contractId: number; plotId: number }[];
}

/** Everything that moves: buses and the crates on each belt lane. */
export interface MotionView {
  tick: number;
  trips: Trip[];
  lanes: {
    beltId: number;
    lane: 'out' | 'in';
    transitTicks: number;
    batches: { enterTick: number; goodId: GoodId }[];
    jammed: boolean;
  }[];
}

export interface UiSnapshot {
  tick: number;
  date: string;
  company: Company | null;
  cashCents: number;
  reputation: number;
  landPriceCents: number;
  sections: {
    id: number;
    owned: boolean;
    powerSupplyKw: number;
    powerDemandKw: number;
    residents: number;
    housingCap: number;
    stockKg: Inventory;
    storageUsedKg: number;
    storageCapKg: number;
    needsMet: { air: number; water: number; food: number; power: number };
  }[];
  workforce: {
    total: number;
    employed: number;
    bySkill: Record<Skill, { total: number; employed: number }>;
  };
  buildings: {
    id: number;
    type: BuildingTypeId;
    level: number;
    status: BuildingStatus;
    progress: number;
    staffing: number;
    powerFactor: number;
    /** Workers' average morale; for housing, the residents'. */
    avgMorale: number;
    /** Per skill, the workers assigned to the current shift against its slots. */
    jobs: Partial<Record<Skill, { filled: number; slots: number }>>;
    input: Inventory;
    output: Inventory;
    outputTph: Partial<Record<GoodId, number>>;
    recipeId: RecipeId | null;
    priority: Priority;
  }[];
  market: {
    goodId: GoodId;
    lastCents: number;
    change24h: number;
    history: number[];
    volume24hKg: number;
  }[];
  orders: Order[];
  contracts: Contract[];
  story: {
    line: { beatId: BeatId; speaker: string; lines: string[] } | null;
    codex: string[];
    muted: HintCategory[];
  };
  alerts: Alert[];
  wageLevel: GameState['wageLevel'];
}

export type MoraleBand = 'lt25' | '25to50' | '50to75' | 'ge75';

export interface PeopleRow {
  id: number;
  name: string;
  skill: Skill;
  level: number;
  home: string;
  job: string | null;
  shift: number;
  morale: number;
  locked: boolean;
}

const isSite = (b: Building) => b.type === 'contractSite';

/** Everything the world view shows except construction progress, as a comparable string. */
export function worldSignature(state: GameState): string {
  return JSON.stringify([
    state.sections.map((s) => [s.id, s.roadNet?.polylines.length ?? 0]),
    state.buildings.map((b) => [
      b.id,
      b.type,
      b.level,
      b.status === 'constructing' || b.status === 'upgrading' ? b.status : 'built',
    ]),
    state.belts.length,
    state.clientAssets.length,
  ]);
}

export function buildWorldView(state: GameState, version: number): WorldView {
  const world = worldOf(state);
  const owned = new Set(state.sections.map((s) => s.id));
  const buyable = new Set(buyableSections(state));
  return {
    version,
    seed: state.seed,
    radius: world.radius,
    sections: world.sections.map((s) => ({
      id: s.id,
      center: s.center,
      polygon: s.polygon,
      owner: owned.has(s.id) ? 'player' : 'authority',
      buyable: buyable.has(s.id),
    })),
    plots: world.plots.map((p) => ({
      id: p.id,
      sectionId: p.sectionId,
      kind: p.kind,
      dir: p.dir,
      deposit: p.deposit,
    })),
    buildings: state.buildings
      .filter((b) => !isSite(b))
      .map((b) => ({
        id: b.id,
        plotId: b.plotId,
        type: b.type,
        level: b.level,
        status: b.status,
        progress: b.progress,
      })),
    roads: state.sections.flatMap(
      (s) =>
        s.roadNet?.polylines.map((l) => ({ id: l.id, sectionId: s.id, points: l.points })) ?? [],
    ),
    belts: state.belts.map((b) => ({
      id: b.id,
      buildingId: b.buildingId,
      points: b.points,
      length: b.length,
    })),
    clientAssets: state.clientAssets.map((a) => ({ ...a })),
    contractSites: state.contracts
      .filter((c) => c.status === 'active' && c.plotId !== null)
      .map((c) => ({ contractId: c.id, plotId: c.plotId! })),
  };
}

export function buildMotionView(state: GameState): MotionView {
  return {
    tick: state.tick,
    trips: state.trips.map((t) => ({
      ...structuredClone(t),
      stops: t.stops.map((stop) => ({
        ...structuredClone(stop),
        skills: stop.workerIds.map((id) => state.people.skill[indexOfId(state.people, id)] ?? 0),
      })),
    })),
    lanes: state.belts.flatMap((b) =>
      (['out', 'in'] as const).map((lane) => ({
        beltId: b.id,
        lane,
        transitTicks: b.transitTicks,
        batches: b[lane].batches.map((x) => ({ enterTick: x.enterTick, goodId: x.goodId })),
        jammed: b[lane].jammed,
      })),
    ),
  };
}

export function buildUiSnapshot(state: GameState): UiSnapshot {
  const p = state.people;
  const bySkill: UiSnapshot['workforce']['bySkill'] = {
    miner: { total: 0, employed: 0 },
    technician: { total: 0, employed: 0 },
    engineer: { total: 0, employed: 0 },
  };
  // Morale summed by workplace, and by home for housing; a home's count is its residents.
  const moraleSum = new Float64Array(state.nextId);
  const heads = new Uint32Array(state.nextId);
  // Workers on the current shift by workplace and skill.
  const shift = shiftAt(state.tick);
  const onShift = new Uint32Array(state.nextId * 3);
  let employed = 0;
  for (let i = 0; i < p.count; i++) {
    const skill = bySkill[SKILL_OF[p.skill[i]!]!];
    skill.total++;
    const morale = p.morale[i]!;
    const home = p.home[i]!;
    if (home >= 0) {
      moraleSum[home]! += morale;
      heads[home]!++;
    }
    const job = p.job[i]!;
    if (job < 0) continue;
    employed++;
    skill.employed++;
    moraleSum[job]! += morale;
    heads[job]!++;
    if (p.shift[i] === shift) onShift[job * 3 + p.skill[i]!]!++;
  }
  const residents = new Map<number, number>();
  const housingCap = new Map<number, number>();
  for (const b of state.buildings) {
    const cap = housingCapacity(b);
    if (cap === 0) continue;
    housingCap.set(b.sectionId, (housingCap.get(b.sectionId) ?? 0) + cap);
    residents.set(b.sectionId, (residents.get(b.sectionId) ?? 0) + heads[b.id]!);
  }
  const factor = new Map(state.sections.map((s) => [s.id, s.power.factor]));
  const crewOf = (b: Building): UiSnapshot['buildings'][number]['jobs'] => {
    const slots = slotsPerShift(b);
    const jobs: UiSnapshot['buildings'][number]['jobs'] = {};
    for (const skill of SKILLS) {
      const n = slots[skill];
      if (n) jobs[skill] = { filled: onShift[b.id * 3 + SKILL_CODE[skill]]!, slots: n };
    }
    return jobs;
  };
  return {
    tick: state.tick,
    date: formatGameDate(state.tick),
    company: state.company,
    cashCents: balance(state.ledger, 'player'),
    reputation: state.reputation,
    landPriceCents: landPrice(state.landPurchases),
    sections: state.sections.map((s) => ({
      id: s.id,
      owned: true,
      powerSupplyKw: s.power.supplyKw,
      powerDemandKw: s.power.demandKw,
      residents: residents.get(s.id) ?? 0,
      housingCap: housingCap.get(s.id) ?? 0,
      stockKg: { ...s.depot },
      storageUsedKg: totalKg(s.depot),
      storageCapKg: storageCapKg(state, s.id),
      needsMet: { ...s.needsMet },
    })),
    workforce: { total: p.count, employed, bySkill },
    buildings: state.buildings
      .filter((b) => !isSite(b))
      .map((b) => {
        return {
          id: b.id,
          type: b.type,
          level: b.level,
          status: b.status,
          progress: b.progress,
          staffing: staffing(state, b),
          powerFactor: factor.get(b.sectionId) ?? 1,
          avgMorale: heads[b.id] ? moraleSum[b.id]! / heads[b.id]! : 0,
          jobs: crewOf(b),
          input: { ...b.input },
          output: { ...b.output },
          outputTph: productionRateTph(state, b),
          recipeId: b.recipeId,
          priority: b.priority,
        };
      }),
    market: GOOD_IDS.map((goodId) => {
      const m = state.market[goodId];
      const h = m.history;
      return {
        goodId,
        lastCents: m.lastCents,
        change24h: h.length > 24 ? h[h.length - 1]! / h[h.length - 25]! - 1 : 0,
        history: [...h],
        volume24hKg: Math.round(m.volume24hKg),
      };
    }),
    orders: state.orders.map((o) => ({ ...o })),
    contracts: structuredClone(state.contracts),
    story: {
      line: currentLine(state, VETERAN_LINES, NARRATOR_LINES),
      codex: [...state.story.codex],
      muted: [...state.story.muted],
    },
    alerts: structuredClone(state.alerts),
    wageLevel: { ...state.wageLevel },
  };
}

const label = (b: Building | undefined) => (b ? `${BUILDINGS[b.type].name} ${b.id}` : null);

const inBand = (morale: number, band: MoraleBand) =>
  band === 'lt25'
    ? morale < 25
    : band === '25to50'
      ? morale >= 25 && morale < 50
      : band === '50to75'
        ? morale >= 50 && morale < 75
        : morale >= 75;

/** One page of the workforce, filtered by home section, skill and morale band. */
export function queryPeople(
  state: GameState,
  filter: { sectionId?: number; skill?: Skill; morale?: MoraleBand },
  offset: number,
  limit: number,
): { total: number; rows: PeopleRow[] } {
  const p = state.people;
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const matches: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const home = byId.get(p.home[i]!);
    if (filter.sectionId !== undefined && home?.sectionId !== filter.sectionId) continue;
    if (filter.skill !== undefined && SKILL_OF[p.skill[i]!] !== filter.skill) continue;
    if (filter.morale !== undefined && !inBand(p.morale[i]!, filter.morale)) continue;
    matches.push(i);
  }
  const rows = matches.slice(offset, offset + limit).map((i) => ({
    id: p.id[i]!,
    name: workerName(p, i),
    skill: SKILL_OF[p.skill[i]!]!,
    level: p.level[i]!,
    home: label(byId.get(p.home[i]!)) ?? 'No home',
    job: label(byId.get(p.job[i]!)),
    shift: p.shift[i]!,
    morale: Math.round(p.morale[i]!),
    locked: p.locked[i] === 1,
  }));
  return { total: matches.length, rows };
}

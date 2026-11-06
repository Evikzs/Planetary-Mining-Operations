import { BUILDINGS, type BuildingTypeId, type RecipeId, type Skill } from '../src/data/buildings';
import { createBelt } from '../src/sim/build/belts';
import { plotOccupied } from '../src/sim/build/construction';
import { addBuilding, gridFor, ownSection, sectionState } from '../src/sim/build/sections';
import { minuteOfDay } from '../src/sim/clock';
import { generateOffer } from '../src/sim/contracts/generate';
import { applyCommand, createGame, step } from '../src/sim/engine';
import { seatCurrentShift } from '../src/sim/people/commute';
import { housingCapacity, residentsByHome } from '../src/sim/people/housing';
import { autoAssign, slotsPerShift } from '../src/sim/people/jobs';
import { arrivalSkill } from '../src/sim/people/migration';
import { addWorker, SKILL_CODE } from '../src/sim/people/store';
import { createRng, deriveSeed, type Rng } from '../src/sim/rng';
import { newId, type GameState } from '../src/sim/state';
import { PLAYER } from '../src/sim/companies';
import { openBooks } from '../src/sim/finance/books';
import { worldOf } from '../src/sim/world/luna';
import { connectToNetwork } from '../src/sim/world/roads';
import type { Plot, RawGoodId } from '../src/sim/world/types';

function founded(seed: number): GameState {
  const s = createGame(seed, { rivals: false });
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

const freePlots = (s: GameState, sectionId: number, kind: Plot['kind']) =>
  worldOf(s).plots.filter(
    (p) => p.sectionId === sectionId && p.kind === kind && !plotOccupied(s, p.id),
  );

function newcomer(s: GameState, rng: Rng, skill: number, home: number): void {
  addWorker(s.people, { first: rng.int(0, 159), last: rng.int(0, 159), skill, level: 1, home });
}

/**
 * A young company a day in: mine, ice drill, smelter, water plant and a second crew quarters,
 * full homes, one ore delivery taken, 30 t of ilmenite in stock, 05:30 with buses on the road.
 */
/** Scenes set state up by hand, so their books open from what each company holds at the end. */
function openAllBooks(s: GameState): void {
  for (const c of s.companies) openBooks(s, c.id);
}

export function makeDemoState(seed: number): GameState {
  const s = founded(seed);
  const home = worldOf(s).foundingSectionId;
  const deposit = (good: RawGoodId) =>
    freePlots(s, home, 'deposit').find((p) => p.deposit?.goodId === good)!;
  const orders: [Plot, BuildingTypeId, RecipeId?][] = [
    [deposit('ilmenite'), 'mine'],
    [deposit('polarVolatiles'), 'iceDrill'],
  ];
  for (const [plot, type] of orders) applyCommand(s, { t: 'build', plotId: plot.id, type });
  for (const [type, recipeId] of [
    ['smelter', 'steel'],
    ['waterPlant'],
    ['crewQuarters'],
    ['solarArray'],
    ['solarArray'],
  ] as const) {
    applyCommand(s, { t: 'build', plotId: freePlots(s, home, 'build')[0]!.id, type, recipeId });
  }
  while (s.buildings.some((b) => b.status === 'constructing')) step(s, { mode: 'coarse' });

  // Fill the new homes the way migration would.
  const rng = createRng(deriveSeed(seed, 'demo'));
  const byHome = residentsByHome(s);
  for (const b of s.buildings) {
    for (let free = housingCapacity(b) - (byHome.get(b.id) ?? 0); free > 0; free--) {
      newcomer(s, rng, SKILL_CODE[arrivalSkill(s)], b.id);
    }
  }
  s.jobsDirty = true;

  let offer = generateOffer(s, rng);
  while (offer.type !== 'oreDelivery') offer = generateOffer(s, rng);
  s.contracts.push(offer);
  applyCommand(s, { t: 'acceptContract', contractId: offer.id });

  while (s.tick < 1440 || minuteOfDay(s.tick) !== 5 * 60) step(s, { mode: 'coarse' });
  for (let i = 0; i < 30; i++) step(s, { mode: 'fine' });
  const depot = sectionState(s, home)!.depot;
  depot.ilmenite = Math.max(depot.ilmenite ?? 0, 30_000);
  openAllBooks(s);
  return s;
}

const BENCH_SECTIONS = 16;
const BENCH_DOMES = 26;
const BENCH_WORKERS = 10_000;
const BENCH_LEVEL = 10;
const BENCH_BUILD_CYCLE: BuildingTypeId[] = [
  'solarArray',
  'assemblyWorks',
  'smelter',
  'waferFab',
  'chemicalRefinery',
  'electrolysisPlant',
  'hydroponicsFarm',
  'waterPlant',
  'airPlant',
  'warehouse',
];
const RIG: Record<RawGoodId, BuildingTypeId> = {
  regolith: 'regolithScoop',
  ilmenite: 'mine',
  anorthite: 'mine',
  kreep: 'mine',
  polarVolatiles: 'iceDrill',
  helium3: 'he3Harvester',
};

function place(s: GameState, plot: Plot, type: BuildingTypeId): void {
  const net = sectionState(s, plot.sectionId)!.roadNet!;
  if (!connectToNetwork(gridFor(s, plot.sectionId), net, plot.dir, () => newId(s))) return;
  const b = addBuilding(s, plot, type, 'active');
  if (BUILDINGS[type].belt) createBelt(s, b);
}

/** Every free plot of a section built on: `first`, then the workplace cycle; a rig on each deposit. */
function buildOut(s: GameState, sid: number, first: BuildingTypeId[]): void {
  freePlots(s, sid, 'build').forEach((p, i) =>
    place(s, p, first[i] ?? BENCH_BUILD_CYCLE[(i - first.length) % BENCH_BUILD_CYCLE.length]!),
  );
  for (const p of freePlots(s, sid, 'deposit')) place(s, p, RIG[p.deposit!.goodId]);
}

/** Every building at the bench level and at work. */
function levelUp(s: GameState): void {
  for (const b of s.buildings) {
    b.level = BENCH_LEVEL;
    b.status = 'active';
    b.progress = 1;
  }
}

/** Up to `max` newcomers in a section's free beds, with the skills its jobs ask for. */
function fillHomes(s: GameState, rng: Rng, sid: number, max: number): number {
  const here = s.buildings.filter((b) => b.sectionId === sid);
  const skills = here.flatMap((b) =>
    (Object.entries(slotsPerShift(b)) as [Skill, number][]).flatMap(([skill, n]) =>
      Array<number>(3 * n).fill(SKILL_CODE[skill]),
    ),
  );
  const byHome = residentsByHome(s);
  let added = 0;
  for (const h of here) {
    for (let free = housingCapacity(h) - (byHome.get(h.id) ?? 0); free > 0 && added < max; free--) {
      newcomer(s, rng, skills[added % skills.length] ?? 0, h.id);
      added++;
    }
  }
  return added;
}

/** Everyone at work: hands beyond the job slots report to a workplace in their own section. */
function employAll(s: GameState): void {
  autoAssign(s);
  const p = s.people;
  const byId = new Map(s.buildings.map((b) => [b.id, b]));
  const sites = new Map<number, number[]>();
  for (const b of s.buildings) {
    if (Object.keys(slotsPerShift(b)).length)
      sites.set(b.sectionId, [...(sites.get(b.sectionId) ?? []), b.id]);
  }
  for (let i = 0, n = 0; i < p.count; i++) {
    if (p.job[i] !== -1) continue;
    const list = sites.get(byId.get(p.home[i]!)!.sectionId)!;
    p.job[i] = list[n % list.length]!;
    p.shift[i] = n++ % 3;
  }
  autoAssign(s); // refreshes commute times
  seatCurrentShift(s);
}

/**
 * The late-game load: 16 sections at level 10, 26 habitat domes, a garage and a full set of
 * workplaces in each, and exactly 10,000 workers, all housed and at work in their own section.
 */
export function makeBenchState(seed: number): GameState {
  const s = founded(seed);
  const world = worldOf(s);
  const order = [world.foundingSectionId];
  for (let i = 0; order.length < BENCH_SECTIONS; i++) {
    for (const n of world.sections[order[i]!]!.neighbors) {
      if (!order.includes(n) && order.length < BENCH_SECTIONS) order.push(n);
    }
  }
  for (const sid of order.slice(1)) ownSection(s, sid, PLAYER);

  let domes = BENCH_DOMES;
  order.forEach((sid, k) => {
    const first: BuildingTypeId[] = [];
    if (!s.buildings.some((b) => b.sectionId === sid && b.type === 'roverGarage'))
      first.push('roverGarage');
    for (let d = Math.min(domes, k < 10 ? 2 : 1); d > 0; d--, domes--) first.push('habitatDome');
    buildOut(s, sid, first);
  });
  levelUp(s);

  // Homes fill section by section, with skills in the mix that section's jobs ask for.
  const rng = createRng(deriveSeed(seed, 'bench'));
  let left = BENCH_WORKERS - s.people.count;
  for (const sid of order) left -= fillHomes(s, rng, sid, left);
  if (left > 0) throw new Error(`bench housing is ${left} short`);
  employAll(s);
  openAllBooks(s);
  return s;
}

const RIVAL_BENCH_SECTIONS = 5;

/**
 * The late-game load beside rivals: the player and five rivals with five sections each, every
 * plot built on at level 10, and exactly 10,000 workers spread evenly, all housed and at work.
 */
export function makeRivalBenchState(seed: number): GameState {
  const s = createGame(seed);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  const world = worldOf(s);
  // In turn, each company takes the lowest free neighbour of its land.
  for (let round = 1; round < RIVAL_BENCH_SECTIONS; round++) {
    for (const c of s.companies) {
      const owned = new Set(s.sections.map((x) => x.id));
      const near = s.sections
        .filter((x) => x.owner === c.id)
        .flatMap((x) => world.sections[x.id]!.neighbors)
        .filter((n) => !owned.has(n))
        .sort((a, b) => a - b);
      ownSection(s, near[0] ?? world.sections.find((x) => !owned.has(x.id))!.id, c.id);
    }
  }
  const order = s.sections.map((x) => x.id);
  for (const sid of order) {
    const garage = s.buildings.some((b) => b.sectionId === sid && b.type === 'roverGarage');
    buildOut(s, sid, [...(garage ? [] : ['roverGarage' as const]), 'habitatDome']);
  }
  levelUp(s);
  const rng = createRng(deriveSeed(seed, 'rivalBench'));
  let left = BENCH_WORKERS - s.people.count;
  order.forEach((sid, k) => {
    left -= fillHomes(s, rng, sid, Math.ceil(left / (order.length - k)));
  });
  if (left > 0) throw new Error(`rival bench housing is ${left} short`);
  employAll(s);
  openAllBooks(s);
  return s;
}

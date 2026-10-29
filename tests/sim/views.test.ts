import { describe, expect, it } from 'vitest';
import { makeBenchState } from '../../bot/scenes';
import { applyCommand, createGame, step } from '../../src/sim/engine';
import { indexOfId } from '../../src/sim/people/store';
import {
  buildMotionView,
  buildUiSnapshot,
  buildWorldView,
  queryPeople,
  worldSignature,
} from '../../src/sim/views';
import type { GameState } from '../../src/sim/state';
import { worldOf } from '../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const plotOf = (s: GameState, kind: 'build' | 'public') =>
  world.plots.find(
    (p) => p.sectionId === home && p.kind === kind && !s.buildings.some((b) => b.plotId === p.id),
  )!;

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function hasTypedArray(v: unknown): boolean {
  if (ArrayBuffer.isView(v) || v instanceof Map || v instanceof Set) return true;
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') return Object.values(v).some(hasTypedArray);
  return false;
}

describe('views', () => {
  it('views survive structuredClone and hold no typed arrays', () => {
    const s = founded();
    const plot = world.plots.find((p) => p.sectionId === home && p.deposit?.goodId === 'ilmenite')!;
    applyCommand(s, { t: 'build', plotId: plot.id, type: 'mine' });
    for (let i = 0; i < 30; i++) step(s, { mode: 'fine' });
    expect(s.trips.length).toBeGreaterThan(0);
    for (const view of [buildWorldView(s, 1), buildMotionView(s), buildUiSnapshot(s)]) {
      expect(hasTypedArray(view)).toBe(false);
      expect(structuredClone(view)).toEqual(view);
    }
  });

  it('motion view trips carry the skill of each rider', () => {
    const s = founded();
    for (let i = 0; i < 30; i++) step(s, { mode: 'fine' });
    const trips = buildMotionView(s).trips;
    expect(trips.length).toBeGreaterThan(0);
    for (const stop of trips.flatMap((t) => t.stops)) {
      expect(stop.skills).toEqual(
        stop.workerIds.map((id) => s.people.skill[indexOfId(s.people, id)]),
      );
    }
    // The sim's own trips stay as they were.
    expect(s.trips.flatMap((t) => t.stops).every((stop) => stop.skills === undefined)).toBe(true);
  });

  it('world version bumps only on world changes', () => {
    const s = founded();
    let sig = worldSignature(s);
    const changed = () => {
      const next = worldSignature(s);
      const moved = next !== sig;
      sig = next;
      return moved;
    };
    step(s, { mode: 'fine' });
    expect(changed()).toBe(false);
    applyCommand(s, { t: 'build', plotId: plotOf(s, 'build').id, type: 'crewQuarters' });
    expect(changed()).toBe(true);
    for (let i = 0; i < 10; i++) step(s, { mode: 'fine' });
    expect(changed()).toBe(false); // progress alone does not count
    for (let i = 0; i < 180; i++) step(s, { mode: 'fine' });
    expect(changed()).toBe(true); // completed
    const fresh = s.buildings.find(
      (b) => b.type === 'crewQuarters' && b.progress === 1 && b.id > 9,
    )!;
    applyCommand(s, { t: 'demolish', buildingId: fresh.id });
    expect(changed()).toBe(true);
    const next = world.sections[home]!.neighbors[0]!;
    applyCommand(s, { t: 'buySection', sectionId: next });
    expect(changed()).toBe(true);
  });

  it('the world view lists contract sites apart from buildings', () => {
    const s = founded();
    const plot = plotOf(s, 'public');
    s.contracts.push({
      id: s.nextId++,
      type: 'infrastructure',
      issuer: 'Lunar Authority',
      status: 'offered',
      offeredTick: 0,
      deadlineTick: 2880,
      hours: 100,
      rewardCents: 1,
      repGain: 5,
      repLoss: 8,
      stages: [{ kind: 'build', engineerHours: 10, done: 0 }],
      stageIndex: 0,
      plotId: plot.id,
      asset: 'commMast',
    });
    applyCommand(s, { t: 'acceptContract', contractId: s.contracts[0]!.id });
    const view = buildWorldView(s, 1);
    expect(view.contractSites).toEqual([{ contractId: s.contracts[0]!.id, plotId: plot.id }]);
    expect(view.buildings.some((b) => b.plotId === plot.id)).toBe(false);
  });

  it('the ui snapshot reports cash, workforce, buildings and the companion line', () => {
    const s = founded();
    const snap = buildUiSnapshot(s);
    expect(snap.cashCents).toBe(25_000_000);
    expect(snap.workforce.total).toBe(33);
    expect(snap.workforce.bySkill.technician).toEqual({ total: 12, employed: 9 });
    expect(snap.buildings.map((b) => b.type)).toContain('solarArray');
    expect(snap.story.line?.speaker).toBe('Ox Varga');
    expect(snap.market).toHaveLength(22);
    expect(snap.sections[0]).toMatchObject({
      id: home,
      owned: true,
      residents: 33,
      housingCap: 36,
    });
  });

  it('ui snapshot shows each crew on the current shift and the buffers', () => {
    const s = founded();
    const array = s.buildings.find((b) => b.type === 'solarArray')!;
    const row = buildUiSnapshot(s).buildings.find((b) => b.id === array.id)!;
    expect(row.jobs).toEqual({ technician: { filled: 1, slots: 1, open: 0 } });
    array.input.ilmenite = 5;
    array.output.steel = 7;
    const again = buildUiSnapshot(s).buildings.find((b) => b.id === array.id)!;
    expect([again.input, again.output]).toEqual([{ ilmenite: 5 }, { steel: 7 }]);
  });

  it('ui snapshot counts open slots over all three shifts', () => {
    const s = founded();
    const array = s.buildings.find((b) => b.type === 'solarArray')!;
    const p = s.people;
    const i = Array.from({ length: p.count }, (_, k) => k).find((k) => p.job[k] === array.id)!;
    p.job[i] = -1;
    const row = buildUiSnapshot(s).buildings.find((b) => b.id === array.id)!;
    expect(row.jobs.technician!.open).toBe(1);
  });

  it('housing reports the average morale of its residents', () => {
    const s = founded();
    const p = s.people;
    for (let i = 0; i < p.count; i++) p.morale[i] = i % 2 ? 40 : 80;
    const quarters = s.buildings.find((b) => b.type === 'crewQuarters')!;
    const row = buildUiSnapshot(s).buildings.find((b) => b.id === quarters.id)!;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.home[i] === quarters.id) {
        sum += p.morale[i]!;
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(row.avgMorale).toBeCloseTo(sum / n, 9);
  });

  it('queryPeople pages and filters workers', () => {
    const s = founded();
    const all = queryPeople(s, {}, 0, 10);
    expect(all.total).toBe(33);
    expect(all.rows).toHaveLength(10);
    const engineers = queryPeople(s, { skill: 'engineer' }, 0, 50);
    expect(engineers.total).toBe(3);
    expect(engineers.rows.every((r) => r.skill === 'engineer')).toBe(true);
    const techs = queryPeople(s, { skill: 'technician' }, 0, 50);
    expect(techs.rows.filter((r) => r.job !== null)).toHaveLength(9);
    expect(techs.rows[0]!.home).toMatch(/^Crew quarters \d+$/);
    expect(queryPeople(s, { morale: 'lt25' }, 0, 50).total).toBe(0);
  });

  it('queryPeople finds one worker by id, with home section and job ids', () => {
    const s = founded();
    const p = s.people;
    const i = Array.from({ length: p.count }, (_, k) => k).find((k) => p.job[k]! >= 0)!;
    const page = queryPeople(s, { workerId: p.id[i]! }, 0, 1);
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({ id: p.id[i], sectionId: home, jobId: p.job[i] });
  });

  it('ui snapshot for the bench state is < 200 KB JSON and builds in < 2 ms', () => {
    const s = makeBenchState(42);
    step(s, { mode: 'fine' });
    const times: number[] = [];
    for (let k = 0; k < 21; k++) {
      const start = performance.now();
      buildUiSnapshot(s);
      times.push(performance.now() - start);
    }
    // The fastest build is its cost: other test files share the CPU, and that only adds time.
    expect(Math.min(...times)).toBeLessThan(2);
    expect(JSON.stringify(buildUiSnapshot(s)).length).toBeLessThan(200_000);
  });
});

import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../src/sim/engine';
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

  it.todo('ui snapshot for the bench state is < 200 KB JSON and builds in < 2 ms');
});

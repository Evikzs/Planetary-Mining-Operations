import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { sectionState } from '../../../src/sim/build/sections';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const plots = world.plots.filter((p) => p.sectionId === home);

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function run(s: GameState, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(s, { mode: 'fine' }));
  return events;
}

function freeBuild(s: GameState) {
  return plots.find((p) => p.kind === 'build' && !s.buildings.some((b) => b.plotId === p.id))!;
}

describe('power grid', () => {
  it('two arrays supply 800 kW; depot+quarters+garage demand 190 kW; factor 1', () => {
    const s = founded();
    run(s, 1);
    expect(sectionState(s, home)!.power).toMatchObject({ supplyKw: 800, demandKw: 190, factor: 1 });
  });

  it('a smelter keeps factor 1 (790 of 800); a mine on top drops it to 800/1040', () => {
    const s = founded();
    applyCommand(s, { t: 'build', plotId: freeBuild(s).id, type: 'smelter' });
    run(s, 360);
    expect(sectionState(s, home)!.power).toMatchObject({ demandKw: 790, factor: 1 });
    const ilmenite = plots.find((p) => p.deposit?.goodId === 'ilmenite')!;
    applyCommand(s, { t: 'build', plotId: ilmenite.id, type: 'mine' });
    run(s, 240);
    const power = sectionState(s, home)!.power;
    expect(power.demandKw).toBe(1040);
    expect(power.factor).toBeCloseTo(800 / 1040, 9);
    expect(s.buildings.find((b) => b.type === 'smelter')!.status).toBe('unpowered');
    expect(
      s.buildings.filter((b) => b.type === 'solarArray').every((b) => b.status !== 'unpowered'),
    ).toBe(true);
  });

  it('fires brownout once and re-arms after recovery', () => {
    const s = founded();
    applyCommand(s, { t: 'build', plotId: freeBuild(s).id, type: 'smelter' });
    const ilmenite = plots.find((p) => p.deposit?.goodId === 'ilmenite')!;
    applyCommand(s, { t: 'build', plotId: ilmenite.id, type: 'mine' });
    let events = run(s, 400);
    expect(events.filter((e) => e.t === 'brownout')).toHaveLength(1);
    const mine = s.buildings.find((b) => b.type === 'mine')!;
    applyCommand(s, { t: 'demolish', buildingId: mine.id });
    events = run(s, 2);
    expect(sectionState(s, home)!.power.factor).toBe(1);
    expect(events.filter((e) => e.t === 'brownout')).toHaveLength(0);
    applyCommand(s, { t: 'build', plotId: freeBuild(s).id, type: 'electrolysisPlant' });
    events = run(s, 300);
    expect(events.filter((e) => e.t === 'brownout')).toHaveLength(1);
  });
});

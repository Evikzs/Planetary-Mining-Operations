import { describe, expect, it } from 'vitest';
import { makeBenchState } from '../../bot/scenes';
import { OFFLINE } from '../../src/data/balance';
import type { Skill } from '../../src/data/buildings';
import { applyCommand, createGame, step } from '../../src/sim/engine';
import { hashState } from '../../src/sim/hash';
import { awayAlerts, runCatchUp } from '../../src/sim/offline';
import { seatCurrentShift } from '../../src/sim/people/commute';
import { autoAssign, slotsPerShift } from '../../src/sim/people/jobs';
import { addWorker, SKILL_CODE } from '../../src/sim/people/store';
import type { GameState } from '../../src/sim/state';
import { worldOf } from '../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const HOUR_MS = 60_000; // one game hour of real time at timescale 1

/** A founded company with a fully staffed mine on ilmenite. */
function withMine(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  const plot = world.plots.find((p) => p.sectionId === home && p.deposit?.goodId === 'ilmenite')!;
  applyCommand(s, { t: 'build', plotId: plot.id, type: 'mine' });
  const mine = s.buildings.find((b) => b.type === 'mine')!;
  mine.status = 'active';
  mine.progress = 1;
  const quarters = s.buildings.find((b) => b.type === 'crewQuarters')!.id;
  for (const [skill, n] of Object.entries(slotsPerShift(mine)) as [Skill, number][]) {
    for (let k = 0; k < 3 * n; k++) {
      addWorker(s.people, {
        first: 0,
        last: 0,
        skill: SKILL_CODE[skill],
        level: 1,
        home: quarters,
      });
    }
  }
  autoAssign(s);
  seatCurrentShift(s);
  return s;
}

describe('offline catch-up', () => {
  it('negative time does nothing', () => {
    const s = withMine();
    const before = hashState(s);
    const progress: number[] = [];
    const summary = runCatchUp(s, -5000, 1, (p) => progress.push(p));
    expect(hashState(s)).toBe(before);
    expect(summary.gameHours).toBe(0);
    expect(progress).toEqual([]);
  });

  it('30 real minutes adds exactly 1,800 ticks', () => {
    const s = withMine();
    const summary = runCatchUp(s, 30 * 60_000, 1);
    expect(s.tick).toBe(1800);
    expect(summary).toMatchObject({ gameHours: 30, capped: false, realMsAway: 1_800_000 });
  });

  it('10 hours is capped at 8 (28,800 ticks), capped=true', () => {
    const s = withMine();
    const summary = runCatchUp(s, 10 * 3_600_000, 1);
    expect(s.tick).toBe(28_800);
    expect(summary.capped).toBe(true);
    expect(summary.gameHours).toBe(480);
  });

  it('production during catch-up is 50% (±2%) of the same span online in coarse mode', () => {
    const away = withMine();
    const summary = runCatchUp(away, 24 * HOUR_MS, 1);
    const online = withMine();
    for (let h = 0; h < 24; h++) step(online, { mode: 'coarse' });
    const ratio = (away.stats.producedKg.ilmenite ?? 0) / (online.stats.producedKg.ilmenite ?? 0);
    expect(Math.abs(ratio - 0.5)).toBeLessThanOrEqual(0.02);
    expect(summary.producedKg.ilmenite).toBe(away.stats.producedKg.ilmenite);
  });

  it('is deterministic and reports progress up to 1', () => {
    const a = withMine();
    const b = withMine();
    const progress: number[] = [];
    runCatchUp(a, 60 * HOUR_MS + 25_000, 1, (p) => progress.push(p));
    runCatchUp(b, 60 * HOUR_MS + 25_000, 1);
    expect(hashState(a)).toBe(hashState(b));
    expect(progress.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < progress.length; i++)
      expect(progress[i]!).toBeGreaterThan(progress[i - 1]!);
    expect(progress.at(-1)).toBe(1);
  });

  it('the summary counts cash, output and people', () => {
    const s = withMine();
    const summary = runCatchUp(s, 48 * HOUR_MS, 1);
    expect(summary.producedKg.ilmenite).toBeGreaterThan(0);
    expect(summary.cashDeltaCents).toBeLessThan(0); // wages, no sales
    expect(summary.arrivals).toBeGreaterThanOrEqual(0);
    expect(summary.departures).toBeGreaterThanOrEqual(0);
  });

  it('keeps one alert per type and section', () => {
    const alerts = awayAlerts([
      { t: 'brownout', sectionId: 1, factor: 0.5 },
      { t: 'brownout', sectionId: 1, factor: 0.4 },
      { t: 'brownout', sectionId: 2, factor: 0.9 },
      { t: 'shortage', sectionId: 1, need: 'food', daysLeft: 2 },
      { t: 'shortage', sectionId: 1, need: 'air', daysLeft: 1 },
      { t: 'shortage', sectionId: 1, need: 'food', daysLeft: 0 },
      { t: 'emigration', count: 2 },
      { t: 'emigration', count: 3 },
      { t: 'contractFailed', contractId: 7 },
      { t: 'buildingCompleted', buildingId: 4 },
    ]);
    expect(alerts.map((e) => e.t)).toEqual([
      'brownout',
      'brownout',
      'shortage',
      'shortage',
      'emigration',
      'contractFailed',
    ]);
  });

  // Building the bench comes before the timed part, so the test as a whole gets longer than 10 s.
  it('catch-up of 480 game hours with 10,000 workers takes < 10 s', () => {
    const s = makeBenchState(42);
    const start = performance.now();
    const summary = runCatchUp(s, OFFLINE.capMs, 1);
    expect(summary.gameHours).toBe(480);
    expect(performance.now() - start).toBeLessThan(10_000);
  }, 30_000);
});

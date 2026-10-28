import { describe, expect, it } from 'vitest';
import { makeBenchState, makeDemoState } from '../../bot/scenes';
import { BUILDINGS } from '../../src/data/buildings';
import { tripDuration } from '../../src/shared/trips';
import { formatGameDate } from '../../src/sim/clock';
import { checkInvariants } from '../../src/sim/invariants';

describe('scenes', () => {
  it('bench has exactly 10,000 workers and ≥ 150 buildings; demo has trips in flight', () => {
    const bench = makeBenchState(42);
    const p = bench.people;
    expect(p.count).toBe(10_000);
    expect(bench.sections).toHaveLength(16);
    expect(bench.buildings.length).toBeGreaterThanOrEqual(150);
    expect(bench.buildings.filter((b) => b.type === 'habitatDome')).toHaveLength(26);
    const workplaces = bench.buildings.filter(
      (b) => Object.keys(BUILDINGS[b.type].jobs).length > 0,
    );
    expect(workplaces.length).toBeGreaterThanOrEqual(140);
    expect(bench.buildings.every((b) => b.level === 10)).toBe(true);
    const homed = Array.from(p.home.subarray(0, p.count)).every((h) => h >= 0);
    const employed = Array.from(p.job.subarray(0, p.count)).every((j) => j >= 0);
    expect([homed, employed]).toEqual([true, true]);
    expect(checkInvariants(bench)).toEqual([]);

    const demo = makeDemoState(42);
    expect(formatGameDate(demo.tick)).toBe('2091-03-02 05:30');
    const moving = demo.trips.filter(
      (t) => t.departTick <= demo.tick && demo.tick < t.departTick + tripDuration(t),
    );
    expect(moving.length).toBeGreaterThan(0);
    expect(demo.sections[0]!.depot.ilmenite ?? 0).toBeGreaterThanOrEqual(30_000);
    expect(demo.contracts.some((c) => c.status === 'active' && c.type === 'oreDelivery')).toBe(
      true,
    );
    for (const type of ['mine', 'iceDrill', 'smelter', 'waterPlant'] as const) {
      expect(demo.buildings.find((b) => b.type === type)?.status, type).not.toBe('constructing');
    }
    // A showcase: the grid carries the whole base.
    expect(demo.sections[0]!.power.factor).toBe(1);
    expect(checkInvariants(demo)).toEqual([]);
  });
});

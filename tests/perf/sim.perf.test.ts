import { describe, expect, it } from 'vitest';
import { makeBenchState, makeRivalBenchState } from '../../bot/scenes';
import { toSaveFile } from '../../src/save/saveFile';
import { serializeState } from '../../src/save/serialize';
import { step } from '../../src/sim/engine';

/** Median of 101 fine ticks, after 10 to settle. */
function medianTickMs(s: ReturnType<typeof makeBenchState>): number {
  for (let i = 0; i < 10; i++) step(s, { mode: 'fine' });
  const times: number[] = [];
  for (let i = 0; i < 101; i++) {
    const t0 = performance.now();
    step(s, { mode: 'fine' });
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[50]!;
}

// The catch-up budget (480 game hours in < 10 s) lives in tests/sim/offline.test.ts.
describe('simulation performance', () => {
  it('the bench state (10,000 workers): median fine tick over 100 ticks < 4 ms', () => {
    expect(medianTickMs(makeBenchState(42))).toBeLessThan(4);
  }, 60_000);

  it('the rival bench (six companies, 10,000 workers): median fine tick over 100 ticks < 4 ms', () => {
    expect(medianTickMs(makeRivalBenchState(1))).toBeLessThan(4);
  }, 60_000);

  it('the rival bench: the slowest tick over one game day < 100 ms', () => {
    const s = makeRivalBenchState(1);
    let slowest = 0;
    for (let i = 0; i < 1440; i++) {
      const t0 = performance.now();
      step(s, { mode: 'fine' });
      slowest = Math.max(slowest, performance.now() - t0);
    }
    expect(slowest).toBeLessThan(100);
  }, 120_000);

  it('the rival-bench save is at least 50% smaller without trip and belt geometry, and encodes in < 60 ms', () => {
    const s = makeRivalBenchState(1);
    // An hour before the 06:00 shift some 590 buses are on the road.
    for (let i = 0; i < 60; i++) step(s, { mode: 'fine' });
    expect(s.trips.length).toBeGreaterThan(400);
    const lean = JSON.stringify(serializeState(s)).length;
    const full = JSON.stringify({
      ...(serializeState(s) as object),
      trips: s.trips,
      belts: s.belts,
    }).length;
    expect(lean).toBeLessThanOrEqual(full / 2);
    const times: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      toSaveFile(s, 0);
      times.push(performance.now() - t0);
    }
    expect(Math.min(...times)).toBeLessThan(60);
  }, 60_000);
});

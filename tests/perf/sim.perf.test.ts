import { describe, expect, it } from 'vitest';
import { makeBenchState } from '../../bot/scenes';
import { step } from '../../src/sim/engine';

// The catch-up budget (480 game hours in < 10 s) lives in tests/sim/offline.test.ts.
describe('simulation performance', () => {
  it('the bench state (10,000 workers): median fine tick over 100 ticks < 4 ms', () => {
    const s = makeBenchState(42);
    for (let i = 0; i < 10; i++) step(s, { mode: 'fine' });
    const times: number[] = [];
    for (let i = 0; i < 101; i++) {
      const t0 = performance.now();
      step(s, { mode: 'fine' });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[50]).toBeLessThan(4);
  }, 60_000);
});

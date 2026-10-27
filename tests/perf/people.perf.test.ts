import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../src/sim/engine';
import { addWorker } from '../../src/sim/people/store';

describe('people performance', () => {
  it('needs, morale and payroll at 10,000 workers: median fine tick < 2 ms', () => {
    const s = createGame(42);
    applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
    const home = s.buildings.find((b) => b.type === 'crewQuarters')!.id;
    for (let i = s.people.count; i < 10_000; i++) {
      addWorker(s.people, { first: i % 160, last: i % 157, skill: i % 3, level: 1, home });
    }
    for (let i = 0; i < 30; i++) step(s, { mode: 'fine' });
    const times: number[] = [];
    for (let i = 0; i < 101; i++) {
      const t0 = performance.now();
      step(s, { mode: 'fine' });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[50]).toBeLessThan(2);
  });
});

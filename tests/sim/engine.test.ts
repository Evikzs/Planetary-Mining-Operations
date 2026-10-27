import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../src/sim/engine';
import { hashState } from '../../src/sim/hash';

describe('engine', () => {
  it('founds a company once, with validation', () => {
    const s = createGame(42);
    expect(applyCommand(s, { t: 'foundCompany', name: 'ab', companionId: 'veteran' })).toEqual({
      ok: false,
      error: 'INVALID_NAME',
    });
    expect(
      applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'pirate' }),
    ).toEqual({ ok: false, error: 'COMPANION_UNAVAILABLE' });
    expect(
      applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' }),
    ).toEqual({ ok: true });
    expect(s.company).toEqual({ name: 'Selene Rock Co', companionId: 'veteran' });
    expect(applyCommand(s, { t: 'foundCompany', name: 'Other', companionId: 'veteran' })).toEqual({
      ok: false,
      error: 'ALREADY_FOUNDED',
    });
  });

  it('fine adds 1 tick, coarse adds 60 and must start on the hour', () => {
    const s = createGame(1);
    step(s, { mode: 'fine' });
    expect(s.tick).toBe(1);
    expect(() => step(s, { mode: 'coarse' })).toThrow('coarse step must start on the hour');
    const t = createGame(1);
    step(t, { mode: 'coarse' });
    expect(t.tick).toBe(60);
  });

  it('emits shiftChange at 06:00, 14:00, 22:00', () => {
    const s = createGame(1);
    const at: number[] = [];
    for (let i = 0; i < 1440; i++) {
      for (const e of step(s, { mode: 'fine' })) if (e.t === 'shiftChange') at.push(s.tick);
    }
    expect(at).toEqual([60, 540, 1020]);
  });

  it('delivers command events with the next step', () => {
    const s = createGame(5);
    applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
    expect(step(s, { mode: 'fine' }).map((e) => e.t)).toContain('founded');
    expect(step(s, { mode: 'fine' }).map((e) => e.t)).not.toContain('founded');
  });

  it('is deterministic', () => {
    const run = (seed: number) => {
      const s = createGame(seed);
      applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
      for (let i = 0; i < 2000; i++) step(s, { mode: 'fine' });
      return hashState(s);
    };
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });
});

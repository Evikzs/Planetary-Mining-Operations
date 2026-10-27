import { describe, expect, it } from 'vitest';
import type { FromWorker } from '../../src/worker/protocol';
import { SimHost } from '../../src/worker/simHost';
import { createMemorySaveStore } from '../../src/save/memoryStore';
import type { GameState } from '../../src/sim/state';
import type { SaveFile } from '../../src/save/types';

const codec = {
  encode: (state: GameState, savedAtRealMs: number): SaveFile => ({
    format: 'pmo-save',
    version: 1,
    savedAtRealMs,
    seed: state.seed,
    tick: state.tick,
    state: structuredClone(state),
    checksum: '',
  }),
  decode: (file: SaveFile) => ({
    state: structuredClone(file.state) as GameState,
    savedAtRealMs: file.savedAtRealMs,
  }),
};

function setup(debug: Partial<{ timescale: number; freeze: boolean }> = {}) {
  let now = 0;
  const posted: FromWorker[] = [];
  const saves = createMemorySaveStore();
  const host = new SimHost({ post: (m) => posted.push(m), now: () => now, saves, codec });
  const flags = { timescale: 1, freeze: false, seed: 42, scene: 'none' as const, noWebgl: false };
  return {
    host,
    posted,
    saves,
    setNow: (ms: number) => (now = ms),
    init: () => host.handle({ t: 'init', nowMs: now, debug: { ...flags, ...debug } }),
    found: () =>
      host.handle({
        t: 'command',
        id: 1,
        cmd: { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' },
      }),
    lastTick: () => {
      const snaps = posted.filter((m) => m.t === 'snapshot');
      const last = snaps[snaps.length - 1];
      return last && last.t === 'snapshot' ? last.tick : -1;
    },
  };
}

describe('SimHost', () => {
  it('does not tick before founding', async () => {
    const h = setup();
    await h.init();
    h.setNow(5000);
    h.host.pump();
    expect(h.lastTick()).toBe(0);
  });

  it('runs one tick per real second after founding', async () => {
    const h = setup();
    await h.init();
    await h.found();
    h.setNow(1000);
    h.host.pump();
    expect(h.lastTick()).toBe(1);
  });

  it('applies commands at once and posts commandResult then snapshot', async () => {
    const h = setup();
    await h.init();
    h.posted.length = 0;
    await h.found();
    expect(h.posted.map((m) => m.t)).toEqual(['commandResult', 'snapshot']);
    const res = h.posted[0];
    expect(res?.t === 'commandResult' && res.result).toEqual({ ok: true });
  });

  it('catches up after a 3-minute and a 2-hour gap without double counting', async () => {
    const h = setup();
    await h.init();
    await h.found();
    h.setNow(180_000);
    h.host.pump();
    expect(h.lastTick()).toBe(180);
    h.setNow(180_000 + 7_200_000);
    h.host.pump();
    expect(h.lastTick()).toBe(180 + 7200);
    h.setNow(180_000 + 7_200_000 + 1000);
    h.host.pump();
    expect(h.lastTick()).toBe(7381);
  });

  it('timescale 60 runs 60 ticks per real second', async () => {
    const h = setup({ timescale: 60 });
    await h.init();
    await h.found();
    h.setNow(1000);
    h.host.pump();
    expect(h.lastTick()).toBe(60);
  });

  it('freeze runs no ticks', async () => {
    const h = setup({ freeze: true });
    await h.init();
    await h.found();
    h.setNow(10_000);
    h.host.pump();
    expect(h.lastTick()).toBe(0);
  });

  it('autosaves every 30 s and on saveNow', async () => {
    const h = setup();
    await h.init();
    await h.found();
    h.setNow(30_000);
    h.host.pump();
    expect(h.saves.writes).toBe(1);
    h.setNow(60_000);
    h.host.pump();
    expect(h.saves.writes).toBe(2);
    await h.host.handle({ t: 'saveNow' });
    expect(h.saves.writes).toBe(3);
  });

  it('reports a failed save instead of dropping it', async () => {
    const posted: FromWorker[] = [];
    const saves = {
      writeAuto: () => Promise.reject(new Error('quota exceeded')),
      loadLatestValid: () => Promise.resolve(null),
    };
    const host = new SimHost({ post: (m) => posted.push(m), now: () => 0, saves, codec });
    await host.handle({
      t: 'init',
      nowMs: 0,
      debug: { timescale: 1, freeze: false, seed: 1, scene: 'none', noWebgl: false },
    });
    await host.handle({
      t: 'command',
      id: 1,
      cmd: { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' },
    });
    await host.handle({ t: 'saveNow' });
    expect(posted).toContainEqual({
      t: 'error',
      message: 'Could not save the game: quota exceeded',
    });
  });

  it('posts invariant violations when a checker is given', async () => {
    let now = 0;
    const posted: FromWorker[] = [];
    const host = new SimHost({
      post: (m) => posted.push(m),
      now: () => now,
      saves: createMemorySaveStore(),
      codec,
      checkInvariants: () => ['player cash is negative'],
    });
    await host.handle({
      t: 'init',
      nowMs: 0,
      debug: { timescale: 1, freeze: false, seed: 1, scene: 'none', noWebgl: false },
    });
    await host.handle({
      t: 'command',
      id: 1,
      cmd: { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' },
    });
    now = 1000;
    host.pump();
    expect(posted).toContainEqual({ t: 'error', message: 'Invariant: player cash is negative' });
  });

  it('restores the latest save on init', async () => {
    const h = setup();
    await h.init();
    await h.found();
    h.setNow(5000);
    h.host.pump();
    await h.host.handle({ t: 'saveNow' });
    const posted: FromWorker[] = [];
    const host2 = new SimHost({
      post: (m) => posted.push(m),
      now: () => 5000,
      saves: h.saves,
      codec,
    });
    await host2.handle({
      t: 'init',
      nowMs: 5000,
      debug: { timescale: 1, freeze: false, seed: null, scene: 'none', noWebgl: false },
    });
    expect(posted[0]).toEqual({ t: 'ready', founded: true });
  });
});

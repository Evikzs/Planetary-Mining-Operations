import { describe, expect, it } from 'vitest';
import type { FromWorker } from '../../src/worker/protocol';
import { SimHost } from '../../src/worker/simHost';
import { createMemorySaveStore } from '../../src/save/memoryStore';
import { applyCommand, createGame } from '../../src/sim/engine';
import type { GameState } from '../../src/sim/state';
import type { SaveFile } from '../../src/save/types';

const codec = {
  exportCode: (file: SaveFile) => Promise.resolve(`PMO1.${JSON.stringify(file)}`),
  importCode: (code: string) =>
    Promise.resolve(code.startsWith('PMO1.') ? (JSON.parse(code.slice(5)) as SaveFile) : null),
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
    expect(h.posted.map((m) => m.t)).toEqual(['commandResult', 'world', 'snapshot']);
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

  it('posts the world on init and again only when it changes', async () => {
    const h = setup();
    await h.init();
    const worlds = () => h.posted.filter((m) => m.t === 'world').length;
    expect(worlds()).toBe(1);
    await h.found();
    expect(worlds()).toBe(2);
    h.setNow(5000);
    h.host.pump();
    expect(worlds()).toBe(2);
    expect(h.posted.some((m) => m.t === 'motion')).toBe(true);
  });

  it('answers people queries and quotes', async () => {
    const h = setup();
    await h.init();
    await h.found();
    await h.host.handle({
      t: 'queryPeople',
      id: 7,
      filter: { skill: 'engineer' },
      offset: 0,
      limit: 5,
    });
    const page = h.posted.find((m) => m.t === 'peoplePage');
    expect(page?.t === 'peoplePage' && [page.id, page.total]).toEqual([7, 3]);
    await h.host.handle({ t: 'quote', id: 8, goodId: 'ilmenite', side: 'sell', kg: 1000 });
    const quote = h.posted.find((m) => m.t === 'quoteResult');
    expect(quote?.t === 'quoteResult' && quote.id === 8 && quote.filledKg).toBe(1000);
  });

  it('export, new game and import bring the company back', async () => {
    const h = setup();
    await h.init();
    await h.found();
    await h.host.handle({ t: 'exportSave', id: 1 });
    const exported = h.posted.find((m) => m.t === 'exportResult');
    const code = exported?.t === 'exportResult' ? exported.code : '';
    expect(code.startsWith('PMO1.')).toBe(true);
    await h.host.handle({ t: 'newGame', seed: 9 });
    expect(h.posted).toContainEqual({ t: 'ready', founded: false });
    await h.host.handle({ t: 'importSave', id: 2, code: 'nonsense' });
    expect(h.posted).toContainEqual({
      t: 'importResult',
      id: 2,
      ok: false,
      error: 'That code is not a valid save.',
    });
    await h.host.handle({ t: 'importSave', id: 3, code });
    expect(h.posted).toContainEqual({ t: 'importResult', id: 3, ok: true });
    const snaps = h.posted.filter((m) => m.t === 'snapshot');
    const last = snaps[snaps.length - 1];
    expect(last?.t === 'snapshot' && last.ui.company?.name).toBe('Selene Rock Co');
  });

  it('saves to and loads from a manual slot', async () => {
    const h = setup();
    await h.init();
    await h.found();
    await h.host.handle({ t: 'manualSave', slot: 2 });
    await h.host.handle({ t: 'newGame', seed: 9 });
    await h.host.handle({ t: 'manualLoad', slot: 2 });
    expect(h.posted.filter((m) => m.t === 'ready').at(-1)).toEqual({ t: 'ready', founded: true });
    await h.host.handle({ t: 'manualLoad', slot: 4 });
    expect(h.posted).toContainEqual({ t: 'error', message: 'That save slot is empty.' });
  });

  it('a long gap posts catch-up progress and an away summary', async () => {
    const h = setup();
    await h.init();
    await h.found();
    h.setNow(600_000); // 10 game hours
    h.host.pump();
    expect(h.lastTick()).toBe(600);
    expect(h.posted).toContainEqual({ t: 'catchUp', progress: 1 });
    const away = h.posted.find((m) => m.t === 'away');
    expect(away?.t === 'away' && away.summary.gameHours).toBe(10);
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

  it('builds a debug scene through the loader instead of loading the save', async () => {
    const saves = createMemorySaveStore();
    await saves.writeAuto(codec.encode(createGame(1), 0));
    const posted: FromWorker[] = [];
    const asked: string[] = [];
    const host = new SimHost({
      post: (m) => posted.push(m),
      now: () => 0,
      saves,
      codec,
      loadScene: (scene, seed) => {
        asked.push(`${scene}:${seed}`);
        const s = createGame(seed);
        applyCommand(s, { t: 'foundCompany', name: 'Scene Rock Co', companionId: 'veteran' });
        return Promise.resolve(s);
      },
    });
    await host.handle({
      t: 'init',
      nowMs: 0,
      debug: { timescale: 1, freeze: false, seed: 42, scene: 'demo', noWebgl: false },
    });
    expect(asked).toEqual(['demo:42']);
    expect(posted[0]).toEqual({ t: 'ready', founded: true });
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

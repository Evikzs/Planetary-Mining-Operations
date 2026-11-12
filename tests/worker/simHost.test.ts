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
  encode: (state: GameState, savedAtRealMs: number, paused: boolean): SaveFile => ({
    format: 'pmo-save',
    version: 1,
    savedAtRealMs,
    paused,
    seed: state.seed,
    tick: state.tick,
    state: structuredClone(state),
    checksum: '',
  }),
  decode: (file: SaveFile) => ({
    state: structuredClone(file.state) as GameState,
    savedAtRealMs: file.savedAtRealMs,
    paused: file.paused ?? false,
  }),
};

function setup(
  debug: Partial<{ timescale: number; freeze: boolean; seed: number }> = {},
  opts: { saves?: ReturnType<typeof createMemorySaveStore>; offlineCatchUp?: boolean } = {},
) {
  let now = 0;
  const posted: FromWorker[] = [];
  const saves = opts.saves ?? createMemorySaveStore();
  const host = new SimHost({ post: (m) => posted.push(m), now: () => now, saves, codec });
  const flags = { timescale: 1, freeze: false, seed: 42, scene: 'none' as const, noWebgl: false };
  const prefs = { offlineCatchUp: opts.offlineCatchUp ?? true };
  return {
    host,
    posted,
    saves,
    setNow: (ms: number) => (now = ms),
    init: () => host.handle({ t: 'init', nowMs: now, debug: { ...flags, ...debug }, prefs }),
    clock: () => {
      const snaps = posted.filter((m) => m.t === 'snapshot');
      const last = snaps[snaps.length - 1];
      return last && last.t === 'snapshot' ? last.clock : null;
    },
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

  it('pause stops the clock; resuming goes on from the same tick, with no catch-up', async () => {
    const h = setup();
    await h.init();
    await h.found();
    h.setNow(3000);
    h.host.pump();
    const at = h.lastTick();
    expect(at).toBe(3);
    await h.host.handle({ t: 'setClock', paused: true, speed: 1 });
    h.setNow(60_000);
    h.host.pump();
    expect(h.lastTick()).toBe(at);
    await h.host.handle({ t: 'setClock', paused: false, speed: 1 });
    h.setNow(62_000);
    h.host.pump();
    expect(h.lastTick()).toBe(at + 2);
  });

  it('resuming saves at once, so a reload does not count the paused time', async () => {
    const h = setup();
    await h.init();
    await h.found();
    await h.host.handle({ t: 'setClock', paused: true, speed: 1 });
    h.setNow(60_000);
    await h.host.handle({ t: 'setClock', paused: false, speed: 1 });
    const saved = await h.saves.loadLatestValid();
    expect(saved).toMatchObject({ savedAtRealMs: 60_000, tick: 0 });
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
      t: 'loadResult',
      id: 2,
      ok: false,
      error: 'That code is not a valid save.',
    });
    await h.host.handle({ t: 'importSave', id: 3, code });
    expect(h.posted).toContainEqual({ t: 'loadResult', id: 3, ok: true });
    const snaps = h.posted.filter((m) => m.t === 'snapshot');
    const last = snaps[snaps.length - 1];
    expect(last?.t === 'snapshot' && last.ui.company?.name).toBe('Selene Rock Co');
  });

  it('a seed whose Moon has no room for its plots gives way to the next one', async () => {
    // About 1 seed in 40 fails world generation; these two were found by the final review.
    const seedOf = (h: ReturnType<typeof setup>) => {
      const worlds = h.posted.filter((m) => m.t === 'world');
      const last = worlds[worlds.length - 1];
      return last?.t === 'world' ? last.world.seed : null;
    };
    const h = setup({ seed: 3_450_755_655 });
    await h.init();
    expect(seedOf(h)).toBeGreaterThan(3_450_755_655);
    expect(seedOf(h)).toBeLessThan(3_450_755_675);
    await h.host.handle({ t: 'newGame', seed: 1_406_710_698 });
    expect(seedOf(h)).toBeGreaterThan(1_406_710_698);
    expect(seedOf(h)).toBeLessThan(1_406_710_718);
  }, 60_000);

  it('saves a new company at once, before the first autosave', async () => {
    const h = setup({ freeze: true });
    await h.init();
    await h.found();
    const saved = await h.saves.loadLatestValid();
    expect((saved?.state as GameState | undefined)?.companies[0]?.name).toBe('Selene Rock Co');
  });

  it('saves each action at once: the save on leaving the page may not finish', async () => {
    const h = setup({ freeze: true });
    await h.init();
    await h.found();
    const writes = h.saves.writes;
    await h.host.handle({
      t: 'command',
      id: 2,
      cmd: { t: 'setWageLevel', skill: 'miner', level: 'high' },
    });
    expect(h.saves.writes).toBe(writes + 1);
    const saved = (await h.saves.loadLatestValid())?.state as GameState | undefined;
    expect(saved?.companies[0]?.wageLevel.miner).toBe('high');
    // A refused command changes nothing, so nothing is saved.
    await h.host.handle({ t: 'command', id: 3, cmd: { t: 'demolish', buildingId: 99_999 } });
    expect(h.saves.writes).toBe(writes + 1);
  });

  it('refuses a code whose inner data is broken, and keeps the company', async () => {
    const h = setup({ freeze: true });
    await h.init();
    await h.found();
    const file = codec.encode(h.saves.files.at(-1)!.state as GameState, 0, false);
    delete (file.state as { sections: { power?: unknown }[] }).sections[0]!.power;
    await h.host.handle({ t: 'importSave', id: 9, code: `PMO1.${JSON.stringify(file)}` });
    expect(h.posted).toContainEqual({
      t: 'loadResult',
      id: 9,
      ok: false,
      error: 'That code is not a valid save.',
    });
    h.host.pump();
    expect(h.posted.filter((m) => m.t === 'error')).toEqual([]);
  });

  it('a broken newest autosave gives way to the one before it', async () => {
    const h = setup({ freeze: true });
    await h.init();
    await h.found();
    const good = h.saves.files.at(-1)!;
    const broken = structuredClone(good);
    broken.savedAtRealMs += 1;
    delete (broken.state as { sections: { power?: unknown }[] }).sections[0]!.power;
    h.saves.files.push(broken);
    const again = new SimHost({
      post: (m) => h.posted.push(m),
      now: () => 0,
      saves: h.saves,
      codec,
    });
    h.posted.length = 0;
    await again.handle({
      t: 'init',
      nowMs: 0,
      debug: { timescale: 1, freeze: true, seed: 42, scene: 'none', noWebgl: false },
    });
    expect(h.posted).toContainEqual({ t: 'ready', founded: true });
    expect(h.posted.filter((m) => m.t === 'error')).toEqual([]);
  });

  it('saves to and loads from a manual slot', async () => {
    const h = setup();
    await h.init();
    await h.found();
    await h.host.handle({ t: 'listSaves', id: 5 });
    expect(h.posted).toContainEqual({ t: 'saveSlots', id: 5, slots: [] });
    h.setNow(90_000);
    await h.host.handle({ t: 'manualSave', id: 6, slot: 2 });
    expect(h.posted).toContainEqual({
      t: 'saveSlots',
      id: 6,
      slots: [{ slot: 2, company: 'Selene Rock Co', tick: 0, savedAtRealMs: 90_000 }],
    });
    await h.host.handle({ t: 'newGame', seed: 9 });
    await h.host.handle({ t: 'manualLoad', id: 7, slot: 2 });
    expect(h.posted).toContainEqual({ t: 'loadResult', id: 7, ok: true });
    expect(h.posted.filter((m) => m.t === 'ready').at(-1)).toEqual({ t: 'ready', founded: true });
    await h.host.handle({ t: 'manualLoad', id: 8, slot: 4 });
    expect(h.posted).toContainEqual({
      t: 'loadResult',
      id: 8,
      ok: false,
      error: 'That save slot is empty.',
    });
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

  it('the freeze flag starts the clock paused', async () => {
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
    expect(h.saves.writes).toBe(1); // founding saves at once
    h.setNow(30_000);
    h.host.pump();
    expect(h.saves.writes).toBe(2);
    h.setNow(60_000);
    h.host.pump();
    expect(h.saves.writes).toBe(3);
    await h.host.handle({ t: 'saveNow' });
    expect(h.saves.writes).toBe(4);
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

  it('starts without saves when the save store cannot open, and says so', async () => {
    const posted: FromWorker[] = [];
    const saves = {
      writeAuto: () => Promise.reject(new Error('blocked')),
      loadLatestValid: () => Promise.reject(new Error('blocked')),
    };
    const host = new SimHost({ post: (m) => posted.push(m), now: () => 0, saves, codec });
    const flags = { timescale: 1, freeze: false, seed: 42, scene: 'none' as const, noWebgl: false };
    await host.handle({ t: 'init', nowMs: 0, debug: flags });
    expect(posted.map((m) => m.t)).toEqual(expect.arrayContaining(['error', 'ready', 'snapshot']));
    await host.handle({
      t: 'command',
      id: 1,
      cmd: { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' },
    });
    // Saves now go to memory: no 'Could not save' message for each one.
    expect(posted.filter((m) => m.t === 'error')).toHaveLength(1);
  });

  it('a step that throws stops the clock once, says so, and is never saved', async () => {
    let now = 0;
    const posted: FromWorker[] = [];
    const saves = createMemorySaveStore();
    const host = new SimHost({
      post: (m) => posted.push(m),
      now: () => now,
      saves,
      codec,
      checkInvariants: () => {
        throw new Error('boom');
      },
    });
    const flags = { timescale: 1, freeze: false, seed: 42, scene: 'none' as const, noWebgl: false };
    await host.handle({ t: 'init', nowMs: 0, debug: flags });
    await host.handle({
      t: 'command',
      id: 1,
      cmd: { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' },
    });
    const writes = saves.writes;
    now = 5000;
    host.pump();
    now = 10_000;
    host.pump();
    const errors = posted.filter((m) => m.t === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.t === 'error' && errors[0].message).toMatch(/^The game stopped: boom\./);
    await host.handle({ t: 'saveNow' });
    expect(saves.writes).toBe(writes);
  });

  it('a request that fails answers with an error message', async () => {
    const posted: FromWorker[] = [];
    const host = new SimHost({
      post: (m) => posted.push(m),
      now: () => 0,
      saves: createMemorySaveStore(),
      codec: { ...codec, exportCode: () => Promise.reject(new Error('no CompressionStream')) },
    });
    const flags = { timescale: 1, freeze: false, seed: 42, scene: 'none' as const, noWebgl: false };
    await host.handle({ t: 'init', nowMs: 0, debug: flags });
    await host.handle({ t: 'exportSave', id: 2 });
    expect(posted).toContainEqual({
      t: 'error',
      message: 'Something went wrong: no CompressionStream',
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
    await saves.writeAuto(codec.encode(createGame(1, { rivals: false }), 0, false));
    const posted: FromWorker[] = [];
    const asked: string[] = [];
    const host = new SimHost({
      post: (m) => posted.push(m),
      now: () => 0,
      saves,
      codec,
      loadScene: (scene, seed) => {
        asked.push(`${scene}:${seed}`);
        const s = createGame(seed, { rivals: false });
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
  describe('clock', () => {
    it('pause holds the tick; speed 4 runs four ticks a real second', async () => {
      const h = setup();
      await h.init();
      await h.found();
      await h.host.handle({ t: 'setClock', paused: true, speed: 1 });
      h.setNow(10_000);
      h.host.pump();
      expect(h.lastTick()).toBe(0);
      await h.host.handle({ t: 'setClock', paused: false, speed: 4 });
      h.setNow(11_000);
      h.host.pump();
      expect(h.lastTick()).toBe(4);
      expect(h.clock()).toMatchObject({ paused: false, speed: 4, rate: 4 });
    });

    it('a paused snapshot has rate 0', async () => {
      const h = setup();
      await h.init();
      await h.found();
      await h.host.handle({ t: 'setClock', paused: true, speed: 8 });
      h.setNow(1000);
      h.host.pump();
      expect(h.clock()).toMatchObject({ paused: true, speed: 8, rate: 0, actualSpeed: 0 });
    });

    it('a new game starts running at 1x, and founding starts the clock', async () => {
      const h = setup();
      await h.init();
      await h.found();
      expect(h.clock()).toMatchObject({ paused: false, speed: 1, rate: 1 });
    });

    it('a loaded game starts paused at the saved tick', async () => {
      const a = setup();
      await a.init();
      await a.found();
      a.setNow(5000);
      a.host.pump();
      await a.host.handle({ t: 'setClock', paused: true, speed: 1 });
      const b = setup({}, { saves: a.saves });
      b.setNow(5000);
      await b.init();
      expect(b.lastTick()).toBe(5);
      expect(b.clock()).toMatchObject({ paused: true, rate: 0 });
      b.setNow(9000);
      b.host.pump();
      expect(b.lastTick()).toBe(5);
    });

    it('a save made while paused does not catch up on load', async () => {
      const a = setup();
      await a.init();
      await a.found();
      await a.host.handle({ t: 'setClock', paused: true, speed: 1 });
      await a.host.handle({ t: 'saveNow' });
      const b = setup({}, { saves: a.saves });
      b.setNow(7_200_000);
      await b.init();
      expect(b.lastTick()).toBe(0);
      expect(b.posted.some((m) => m.t === 'away' || m.t === 'catchUp')).toBe(false);
    });

    it('a save made while running catches up only when the setting is on', async () => {
      const a = setup();
      await a.init();
      await a.found();
      await a.host.handle({ t: 'saveNow' });
      const on = setup({}, { saves: a.saves, offlineCatchUp: true });
      on.setNow(7_200_000);
      await on.init();
      expect(on.lastTick()).toBe(7200);
      const off = setup({}, { saves: a.saves, offlineCatchUp: false });
      off.setNow(7_200_000);
      await off.init();
      expect(off.lastTick()).toBe(0);
      expect(off.clock()).toMatchObject({ paused: true });
    });

    it('a save without a paused flag catches up when the setting is on', async () => {
      const a = setup();
      await a.init();
      await a.found();
      await a.host.handle({ t: 'saveNow' });
      const file = await a.saves.loadLatestValid();
      delete (file as { paused?: boolean }).paused;
      const saves = createMemorySaveStore();
      await saves.writeAuto(file!);
      const b = setup({}, { saves });
      b.setNow(7_200_000);
      await b.init();
      expect(b.lastTick()).toBe(7200);
    });

    it('a backlog during play is dropped, not caught up', async () => {
      // Each read of the clock costs 10 ms, as if every tick were slow.
      let now = 0;
      const posted: FromWorker[] = [];
      const host = new SimHost({
        post: (m) => posted.push(m),
        now: () => (now += 10),
        saves: createMemorySaveStore(),
        codec,
      });
      const debug = {
        timescale: 600,
        freeze: false,
        seed: 42,
        scene: 'none' as const,
        noWebgl: false,
      };
      await host.handle({ t: 'init', nowMs: 0, debug, prefs: { offlineCatchUp: true } });
      await host.handle({
        t: 'command',
        id: 1,
        cmd: { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' },
      });
      await host.handle({ t: 'setClock', paused: false, speed: 8 });
      for (let i = 0; i < 4; i++) {
        now += 1000; // a second between pumps owes thousands of ticks; a slow pump runs a few
        host.pump();
      }
      expect(posted.some((m) => m.t === 'catchUp' || m.t === 'away')).toBe(false);
      const snaps = posted.filter((m) => m.t === 'snapshot');
      const last = snaps[snaps.length - 1];
      expect(last?.t === 'snapshot' && last.tick).toBeLessThan(100);
    });

    it('a slow pump reports the real speed', async () => {
      let now = 0;
      const posted: FromWorker[] = [];
      const host = new SimHost({
        post: (m) => posted.push(m),
        now: () => (now += 10),
        saves: createMemorySaveStore(),
        codec,
      });
      const debug = {
        timescale: 600,
        freeze: false,
        seed: 42,
        scene: 'none' as const,
        noWebgl: false,
      };
      await host.handle({ t: 'init', nowMs: 0, debug, prefs: { offlineCatchUp: true } });
      await host.handle({
        t: 'command',
        id: 1,
        cmd: { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' },
      });
      await host.handle({ t: 'setClock', paused: false, speed: 8 });
      for (let i = 0; i < 60; i++) host.pump();
      const snaps = posted.filter((m) => m.t === 'snapshot');
      const last = snaps[snaps.length - 1];
      const actual = last?.t === 'snapshot' ? last.clock.actualSpeed : 8;
      expect(actual).toBeGreaterThan(0);
      expect(actual).toBeLessThan(4);
    });

    it('a gap with no pumps for over 5 s catches up only when the setting is on', async () => {
      const on = setup({}, { offlineCatchUp: true });
      await on.init();
      await on.found();
      on.setNow(600_000);
      on.host.pump();
      expect(on.lastTick()).toBe(600);
      const off = setup({}, { offlineCatchUp: false });
      await off.init();
      await off.found();
      off.setNow(600_000);
      off.host.pump();
      expect(off.lastTick()).toBe(0);
      off.setNow(601_000);
      off.host.pump();
      expect(off.lastTick()).toBe(1);
    });

    it('setPrefs changes the gap rule', async () => {
      const h = setup({}, { offlineCatchUp: true });
      await h.init();
      await h.found();
      await h.host.handle({ t: 'setPrefs', prefs: { offlineCatchUp: false } });
      h.setNow(600_000);
      h.host.pump();
      expect(h.lastTick()).toBe(0);
    });

    it('saveNow with an id answers saved after the write', async () => {
      const h = setup();
      await h.init();
      await h.found();
      const before = h.saves.writes;
      await h.host.handle({ t: 'saveNow', id: 7 });
      expect(h.saves.writes).toBe(before + 1);
      expect(h.posted[h.posted.length - 1]).toEqual({ t: 'saved', id: 7 });
    });
  });
  it('useSaves swaps the save store before init', async () => {
    const a = setup();
    await a.init();
    await a.found();
    const b = setup();
    b.host.useSaves(a.saves);
    await b.init();
    expect(b.posted).toContainEqual({ t: 'ready', founded: true });
  });
});

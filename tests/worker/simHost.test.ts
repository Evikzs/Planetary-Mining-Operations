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

function setup(debug: Partial<{ timescale: number; freeze: boolean; seed: number }> = {}) {
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
    expect((saved?.state as GameState | undefined)?.company?.name).toBe('Selene Rock Co');
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
    expect(saved?.wageLevel.miner).toBe('high');
    // A refused command changes nothing, so nothing is saved.
    await h.host.handle({ t: 'command', id: 3, cmd: { t: 'demolish', buildingId: 99_999 } });
    expect(h.saves.writes).toBe(writes + 1);
  });

  it('refuses a code whose inner data is broken, and keeps the company', async () => {
    const h = setup({ freeze: true });
    await h.init();
    await h.found();
    const file = codec.encode(h.saves.files.at(-1)!.state as GameState, 0);
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

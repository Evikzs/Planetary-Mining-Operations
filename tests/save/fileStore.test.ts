import { describe, expect, it } from 'vitest';
import { createFileSaveStore, type SlotIo } from '../../src/save/fileStore';
import { toSaveFile } from '../../src/save/saveFile';
import { applyCommand, createGame } from '../../src/sim/engine';

function memoryIo(): SlotIo & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    list: () => Promise.resolve([...files.keys()].sort()),
    read: (slot) => Promise.resolve(files.get(slot) ?? null),
    write: (slot, text) => {
      files.set(slot, text);
      return Promise.resolve();
    },
  };
}

const game = createGame(1, { rivals: false });
const save = (at: number) => toSaveFile(game, at);
const savedAt = (io: { files: Map<string, string> }, slot: string) =>
  (JSON.parse(io.files.get(slot)!) as { savedAtRealMs: number }).savedAtRealMs;

describe('the file save store', () => {
  it('autosaves rotate through three slots, oldest first', async () => {
    const io = memoryIo();
    const store = createFileSaveStore(io);
    for (const at of [1, 2, 3, 4]) await store.writeAuto(save(at));
    expect(savedAt(io, 'auto-0')).toBe(4);
    expect(savedAt(io, 'auto-1')).toBe(2);
    expect(savedAt(io, 'auto-2')).toBe(3);
    // A new session goes on from the oldest slot it finds.
    const next = createFileSaveStore(io);
    await next.writeAuto(save(5));
    expect(savedAt(io, 'auto-1')).toBe(5);
  });

  it('loadLatestValid skips a corrupt newest slot', async () => {
    const io = memoryIo();
    const store = createFileSaveStore(io);
    await store.writeAuto(save(1));
    await store.writeAuto({ ...save(2), checksum: 'bad' });
    io.files.set('auto-2', '{ not json');
    expect((await store.loadLatestValid())?.savedAtRealMs).toBe(1);
  });

  it('manual slots round-trip and list with company names', async () => {
    const founded = createGame(1, { rivals: false });
    applyCommand(founded, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
    const io = memoryIo();
    const store = createFileSaveStore(io);
    await store.writeManual!(2, toSaveFile(founded, 7));
    expect((await store.readManual!(2))?.savedAtRealMs).toBe(7);
    expect(await store.readManual!(3)).toBeNull();
    expect(await store.list!()).toEqual([
      { slot: 'manual-2', savedAtRealMs: 7, tick: founded.tick, company: 'Selene Rock Co' },
    ]);
  });

  it('overlapping autosaves go to different slots, one after the other', async () => {
    const io = memoryIo();
    let writing = 0;
    let most = 0;
    const slow: SlotIo = {
      ...io,
      async write(slot, text) {
        most = Math.max(most, ++writing);
        await new Promise((r) => setTimeout(r, 5));
        await io.write(slot, text);
        writing--;
      },
    };
    const store = createFileSaveStore(slow);
    await Promise.all([store.writeAuto(save(1)), store.writeAuto(save(2))]);
    expect(most).toBe(1);
    expect(savedAt(io, 'auto-0')).toBe(1);
    expect(savedAt(io, 'auto-1')).toBe(2);
  });
});

import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../src/sim/engine';
import { hashState } from '../../src/sim/hash';
import { decodeExportCode, encodeExportCode } from '../../src/save/exportCode';
import { migrate, type Migrations } from '../../src/save/migrations';
import { computeChecksum, fromSaveFile, toSaveFile } from '../../src/save/saveFile';
import { deserializeState, serializeState } from '../../src/save/serialize';
import { createIdbSaveStore } from '../../src/save/slots';
import type { SaveFile } from '../../src/save/types';
import fixture from '../fixtures/saves/v1-founding.json';

function foundedState(ticks = 200) {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  for (let i = 0; i < ticks; i++) step(s, { mode: 'fine' });
  return s;
}

let dbCounter = 0;
const freshDbName = () => `pmo-test-${dbCounter++}`;

describe('save files', () => {
  it('round-trips a state', () => {
    const s = foundedState();
    const back = deserializeState(JSON.parse(JSON.stringify(serializeState(s))));
    expect(hashState(back)).toBe(hashState(s));
  });

  it('round-trips through a save file', () => {
    const s = foundedState();
    const res = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(s, 1234))));
    expect(res.ok && hashState(res.state)).toBe(hashState(s));
    expect(res.ok && res.savedAtRealMs).toBe(1234);
  });

  it('rejects a tampered checksum, a newer version and a wrong shape', () => {
    const file = toSaveFile(foundedState(), 1);
    expect(fromSaveFile({ ...file, tick: file.tick + 1 })).toEqual({
      ok: false,
      error: 'BAD_CHECKSUM',
    });
    expect(fromSaveFile({ ...file, version: 99 })).toEqual({ ok: false, error: 'TOO_NEW' });
    expect(fromSaveFile({ hello: 1 })).toEqual({ ok: false, error: 'BAD_FORMAT' });
    expect(fromSaveFile('{"format":"pmo-save",')).toEqual({ ok: false, error: 'BAD_FORMAT' });
  });

  it('rejects a state with missing fields', () => {
    const file = toSaveFile(foundedState(), 1);
    const broken = { ...(file.state as Record<string, unknown>) };
    delete broken.tick;
    const signed = { ...file, state: broken };
    signed.checksum = computeChecksum(signed);
    expect(fromSaveFile(signed)).toEqual({
      ok: false,
      error: 'INVALID_STATE',
    });
  });

  it('migrate applies steps in order', () => {
    const file: SaveFile = { ...toSaveFile(foundedState(1), 1), version: 1 };
    const registry: Migrations = {
      1: (s) => ({ ...s, a: 1 }),
      2: (s) => ({ ...s, b: 2 }),
    };
    const out = migrate(file, registry, 3);
    expect(out.version).toBe(3);
    expect(out.state).toMatchObject({ a: 1, b: 2 });
  });

  it('loads the v1 fixture', () => {
    expect(fromSaveFile(fixture).ok).toBe(true);
  });
});

describe('IndexedDB slots', () => {
  it('rotates autosaves auto-0..2 and loads the newest', async () => {
    const name = freshDbName();
    const store = createIdbSaveStore(name);
    for (const t of [10, 20, 30, 40]) await store.writeAuto(toSaveFile(foundedState(1), t));
    const latest = await store.loadLatestValid();
    expect(latest?.savedAtRealMs).toBe(40);
    const db = await openDB(name);
    expect(((await db.get('saves', 'auto-0')) as SaveFile).savedAtRealMs).toBe(40);
    db.close();
  });

  it('falls back to the previous valid autosave', async () => {
    const name = freshDbName();
    const store = createIdbSaveStore(name);
    for (const t of [10, 20, 30]) await store.writeAuto(toSaveFile(foundedState(1), t));
    const db = await openDB(name);
    await db.put('saves', '{"format":"pmo-save",', 'auto-2');
    db.close();
    expect((await store.loadLatestValid())?.savedAtRealMs).toBe(20);
  });

  it('keeps manual slots and lists them', async () => {
    const store = createIdbSaveStore(freshDbName());
    await store.writeManual(2, toSaveFile(foundedState(1), 5));
    expect((await store.readManual(2))?.savedAtRealMs).toBe(5);
    expect(await store.readManual(3)).toBeNull();
    expect(await store.list()).toEqual([
      { slot: 'manual-2', savedAtRealMs: 5, tick: 1, company: 'Selene Rock Co' },
    ]);
  });
});

describe('export codes', () => {
  it('round-trips and rejects junk', async () => {
    const file = toSaveFile(foundedState(), 7);
    const code = await encodeExportCode(file);
    expect(code.startsWith('PMO1.')).toBe(true);
    const back = await decodeExportCode(code);
    expect(back.ok && back.file).toEqual(file);
    expect(await decodeExportCode('hello')).toEqual({ ok: false, error: 'BAD_PREFIX' });
    expect(await decodeExportCode('PMO1.@@@')).toEqual({ ok: false, error: 'BAD_DATA' });
  });
});

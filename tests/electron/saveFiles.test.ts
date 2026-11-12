import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSlots, readSlot, removeSlot, writeSlot } from '../../electron/saveFiles';

let dir = '';
beforeEach(async () => {
  dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pmo-saves-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.promises.rm(dir, { recursive: true, force: true });
});

describe('save files', () => {
  it('writes, lists and reads a slot', async () => {
    await writeSlot(dir, 'auto-0', '{"a":1}');
    await writeSlot(dir, 'manual-3', '{"b":2}');
    expect(await listSlots(dir)).toEqual(['auto-0', 'manual-3']);
    expect(await readSlot(dir, 'auto-0')).toBe('{"a":1}');
    expect(await readSlot(dir, 'auto-1')).toBeNull();
    await removeSlot(dir, 'manual-3');
    expect(await listSlots(dir)).toEqual(['auto-0']);
  });

  it('lists nothing before the folder exists', async () => {
    expect(await listSlots(path.join(dir, 'missing'))).toEqual([]);
  });

  it('refuses bad slot names', async () => {
    for (const slot of ['../x', 'auto-3', 'manual-0', 'auto-0/../../etc']) {
      await expect(writeSlot(dir, slot, 'x')).rejects.toThrow('bad slot name');
      await expect(readSlot(dir, slot)).rejects.toThrow('bad slot name');
    }
  });

  it('a failed write leaves the old file whole', async () => {
    await writeSlot(dir, 'auto-1', 'version 1');
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('disk full'));
    await expect(writeSlot(dir, 'auto-1', 'version 2')).rejects.toThrow('disk full');
    expect(await readSlot(dir, 'auto-1')).toBe('version 1');
  });

  it('two writes to one slot at once both finish, and the file holds one of them', async () => {
    const a = 'a'.repeat(50_000);
    const b = 'b'.repeat(10);
    await Promise.all([writeSlot(dir, 'auto-0', a), writeSlot(dir, 'auto-0', b)]);
    expect([a, b]).toContain(await readSlot(dir, 'auto-0'));
  });
});

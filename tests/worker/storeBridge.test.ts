import { describe, expect, it } from 'vitest';
import type { FromWorker } from '../../src/worker/protocol';
import { createBridgeSlotIo } from '../../src/worker/storeBridge';

describe('the store bridge', () => {
  it('asks the page and settles each call by id', async () => {
    const sent: FromWorker[] = [];
    const bridge = createBridgeSlotIo((m) => sent.push(m));
    const read = bridge.io.read('auto-1');
    const write = bridge.io.write('auto-2', 'x');
    expect(sent).toEqual([
      { t: 'storeCall', id: 1, op: 'read', slot: 'auto-1', text: undefined },
      { t: 'storeCall', id: 2, op: 'write', slot: 'auto-2', text: 'x' },
    ]);
    bridge.settle({ t: 'storeResult', id: 2, ok: false, error: 'disk full' });
    bridge.settle({ t: 'storeResult', id: 1, ok: true, value: 'save text' });
    await expect(read).resolves.toBe('save text');
    await expect(write).rejects.toThrow('disk full');
  });
});

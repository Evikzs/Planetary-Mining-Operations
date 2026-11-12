import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOfflinePref, saveOfflinePref } from '../../src/client/preferences';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('the offline preference', () => {
  it('is on when nothing was saved or storage is blocked', () => {
    expect(loadOfflinePref()).toBe(true);
    vi.stubGlobal('localStorage', fakeStorage());
    expect(loadOfflinePref()).toBe(true);
  });

  it('keeps a choice to turn it off', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveOfflinePref(false);
    expect(loadOfflinePref()).toBe(false);
    saveOfflinePref(true);
    expect(loadOfflinePref()).toBe(true);
  });
});

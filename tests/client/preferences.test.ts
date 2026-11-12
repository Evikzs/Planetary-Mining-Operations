import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadOfflinePref,
  loadUiScale,
  saveOfflinePref,
  saveUiScale,
} from '../../src/client/preferences';

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

describe('the interface size', () => {
  it('defaults to 90% under 1440 px and 100% above', () => {
    expect(loadUiScale(1280)).toBe(0.9);
    expect(loadUiScale(1920)).toBe(1);
  });

  it('a saved size wins, and a bad value counts as unset', () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    saveUiScale(1.25);
    expect(loadUiScale(1280)).toBe(1.25);
    store.setItem('pmo.uiScale', '3');
    expect(loadUiScale(1920)).toBe(1);
  });
});

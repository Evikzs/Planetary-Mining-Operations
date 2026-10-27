import type { DebugFlags } from '../worker/protocol';

export const DEFAULT_DEBUG_FLAGS: DebugFlags = {
  timescale: 1,
  freeze: false,
  seed: null,
  scene: 'none',
  noWebgl: false,
};

/** Debug flags only work in dev and e2e builds; players never get a timescale. */
export function parseDebugFlags(search: string, enabled: boolean): DebugFlags {
  if (!enabled) return { ...DEFAULT_DEBUG_FLAGS };
  const q = new URLSearchParams(search);
  const int = (name: string): number | null => {
    const v = q.get(name);
    return v !== null && /^-?\d+$/.test(v) ? Number(v) : null;
  };
  const scene = q.get('scene');
  return {
    timescale: Math.min(600, Math.max(1, int('timescale') ?? 1)),
    freeze: q.get('freeze') === '1',
    seed: int('seed'),
    scene: scene === 'demo' || scene === 'bench' ? scene : 'none',
    noWebgl: q.get('nowebgl') === '1',
  };
}

export function debugEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'e2e';
}

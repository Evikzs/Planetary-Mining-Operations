import { describe, expect, it } from 'vitest';
import { START_CASH_CENTS } from '../src/data/balance';
import { runBot } from './strategy';

describe('balance bot', () => {
  it('meets the M1 day-1 pacing targets in < 60 s', () => {
    const started = performance.now();
    const r = runBot(42, 1440);
    const seconds = (performance.now() - started) / 1000;
    console.log(JSON.stringify({ ...r, seconds: Math.round(seconds) }));
    expect(seconds).toBeLessThan(60);
    expect(r.sections).toBeGreaterThanOrEqual(2);
    expect(r.sections).toBeLessThanOrEqual(6);
    expect(r.activeSmelters).toBeGreaterThanOrEqual(1);
    expect(r.population).toBeGreaterThanOrEqual(60);
    expect(r.contractsCompleted).toBeGreaterThanOrEqual(3);
    expect(r.cashCents).toBeGreaterThan(START_CASH_CENTS);
    expect(r.worstLifeSupportHours).toBeLessThanOrEqual(24);
  });
});

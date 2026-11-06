import { describe, expect, it } from 'vitest';
import { runBot } from './strategy';

describe('balance bot', () => {
  it('meets the M2a day-1 targets beside five rivals in < 90 s', () => {
    const started = performance.now();
    const r = runBot(42, 1440);
    const seconds = (performance.now() - started) / 1000;
    console.log(JSON.stringify({ ...r, seconds: Math.round(seconds) }));
    expect(seconds).toBeLessThan(90);
    expect(r.sections).toBeGreaterThanOrEqual(2);
    expect(r.sections).toBeLessThanOrEqual(4);
    expect(r.auctionsWonAgainstRivals).toBeGreaterThanOrEqual(1);
    expect(r.activeSmelters).toBeGreaterThanOrEqual(1);
    expect(r.population).toBeGreaterThanOrEqual(60);
    expect(r.contractsCompleted).toBeGreaterThanOrEqual(2);
    expect(r.equityGrowth).toBeGreaterThanOrEqual(3);
    expect(r.equityGrowth).toBeLessThanOrEqual(5);
    expect(r.worstLifeSupportHours).toBeLessThanOrEqual(24);
    expect(r.activeRivals).toBeGreaterThanOrEqual(3);
    expect(r.rivalsWithoutSection).toBe(0);
    expect(r.rivalEquityGrowth.every((g) => g >= 0.5 && g <= 8)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { localHour, sunDirection, windowsLit } from '../../src/render/sun';
import { fromLatLon, dot } from '../../src/shared/vec3';

// Tick 0 is 05:00; one tick is a game minute.
const at = (hour: number): number => (hour - 5) * 60;

describe('sun', () => {
  it('the clock is local solar time at the reference longitude', () => {
    const ref = 1.1;
    for (const h of [0, 5, 6, 12, 18.5, 23]) expect(localHour(ref, at(h), ref)).toBeCloseTo(h, 9);
  });

  it('noon puts the sun overhead at the reference on the equator, midnight under it', () => {
    const ref = -0.7;
    const here = fromLatLon(0, ref);
    expect(dot(sunDirection(at(12), ref), here)).toBeCloseTo(1, 9);
    expect(dot(sunDirection(at(0), ref), here)).toBeCloseTo(-1, 9);
    expect(dot(sunDirection(at(6), ref), here)).toBeCloseTo(0, 9);
  });

  it('a place east of the reference sees the sun earlier', () => {
    expect(localHour(0.5 + Math.PI / 12, at(12), 0.5)).toBeCloseTo(13, 9);
  });

  it('near the south pole the sun stays low', () => {
    const charter = fromLatLon((-60 * Math.PI) / 180, 0);
    const noon = Math.asin(dot(sunDirection(at(12), 0), charter));
    expect((noon * 180) / Math.PI).toBeCloseTo(30, 6);
  });

  it('most windows are lit in the evening', () => {
    expect(windowsLit(20)).toBeCloseTo(0.85, 9);
    expect(windowsLit(8)).toBeCloseTo(0.25, 9);
  });
});

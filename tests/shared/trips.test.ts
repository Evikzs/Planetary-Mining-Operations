import { describe, expect, it } from 'vitest';
import { pointAt, stopTimes, tripDuration, tripState, type Trip } from '../../src/shared/trips';
import { len, normalize, sub, type Vec3 } from '../../src/shared/vec3';

// A straight run along a meridian: 0.06 rad apart at radius 100 is about 6 units.
const points: Vec3[] = [0, 0.03, 0.06].map((a) => [0, Math.sin(a), Math.cos(a)] as Vec3);
const trip: Trip = {
  id: 1,
  sectionId: 0,
  departTick: 100,
  points,
  cum: [0, 3, 6],
  stops: [
    { s: 3, buildingId: 7, workerIds: [1], dwell: 1 },
    { s: 6, buildingId: 8, workerIds: [2], dwell: 1 },
  ],
  speed: 0.3,
  kind: 'toWork',
};

describe('trips', () => {
  it('tripState: s=0 at depart, holds at stops, monotonic, null after end', () => {
    expect(tripState(trip, 99.9)).toBeNull();
    expect(tripState(trip, 100)).toEqual({ s: 0, moving: true, stopIndex: null });
    expect(tripState(trip, 110.5)).toEqual({ s: 3, moving: false, stopIndex: 0 });
    const end = 100 + tripDuration(trip);
    expect(tripDuration(trip)).toBeCloseTo(22, 9);
    let prev = -1;
    for (let t = 100; t <= end; t += 0.25) {
      const s = tripState(trip, t)!.s;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(tripState(trip, end + 0.5)).toEqual({ s: 6, moving: false, stopIndex: 1 });
    expect(tripState(trip, end + 1.01)).toBeNull();
  });

  it('eases each leg: slow start, fast middle', () => {
    expect(tripState(trip, 102.5)!.s).toBeLessThan(0.75);
    expect(tripState(trip, 105)!.s).toBeGreaterThan(1.5);
  });

  it('stopTimes gives when the bus reaches each stop', () => {
    expect(stopTimes(trip)).toEqual([110, 121]);
  });

  it('pointAt interpolates on the sphere and clamps', () => {
    const near = (a: Vec3, b: Vec3) => expect(len(sub(a, b))).toBeLessThan(1e-12);
    near(pointAt(points, trip.cum, -1).pos, points[0]!);
    near(pointAt(points, trip.cum, 99).pos, normalize(points[2]!));
    const mid = pointAt(points, trip.cum, 1.5);
    expect(len(mid.pos)).toBeCloseTo(1, 12);
    expect(mid.pos[1]).toBeGreaterThan(0);
    expect(mid.pos[1]).toBeLessThan(points[1]![1]);
    expect(len(mid.tangent)).toBeCloseTo(1, 12);
  });
});

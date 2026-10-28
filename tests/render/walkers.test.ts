import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { busGeometry } from '../../src/render/world/roverLayer';
import { trafficWidth } from '../../src/render/world/trafficLayer';
import { walkerPositions } from '../../src/render/world/walkerLayer';
import { LUNA_RADIUS, WALK_SPEED } from '../../src/shared/scale';
import { pointAt, stopTimes, type Trip } from '../../src/shared/trips';
import { angleBetween, normalize, type Vec3 } from '../../src/shared/vec3';

const points: Vec3[] = Array.from({ length: 11 }, (_, i) => normalize([i * 0.004, 1, 0]));
const cum = points.map((p) => angleBetween(points[0]!, p) * LUNA_RADIUS);
const trip: Trip = {
  id: 1,
  sectionId: 0,
  departTick: 100,
  points,
  cum,
  stops: [{ s: 2, buildingId: 7, workerIds: [11, 12], dwell: 1, skills: [0, 2] }],
  speed: 0.3,
  kind: 'toWork',
};
const door = normalize([0.02, 1, 0.006]);
const doors = new Map([[7, door]]);
const near = (a: Vec3, b: Vec3) => angleBetween(a, b) * LUNA_RADIUS;

describe('walkers', () => {
  it('walkers start at the stop and reach the door after distance / WALK_SPEED minutes', () => {
    const [arrive] = stopTimes(trip);
    const stop = pointAt(points, cum, 2).pos;
    const walk = near(stop, door) / WALK_SPEED;
    expect(walkerPositions(trip, arrive! - 0.5, doors)).toEqual([]);
    const first = walkerPositions(trip, arrive!, doors);
    expect(first.map((w) => w.skill)).toEqual([0, 2]);
    for (const w of first) expect(near(w.pos, stop)).toBeLessThan(1e-9);
    const halfway = walkerPositions(trip, arrive! + walk / 2, doors);
    for (const w of halfway) expect(near(w.pos, door)).toBeCloseTo(near(stop, door) / 2, 6);
    const almost = walkerPositions(trip, arrive! + walk - 0.01, doors);
    for (const w of almost) expect(near(w.pos, door)).toBeLessThan(WALK_SPEED * 0.02);
    expect(walkerPositions(trip, arrive! + walk + 0.01, doors)).toEqual([]);
  });

  it('a stop with no known door shows nobody', () => {
    const [arrive] = stopTimes(trip);
    expect(walkerPositions(trip, arrive!, new Map())).toEqual([]);
  });
});

describe('buses and traffic', () => {
  it('the bus is 0.22 long, nose along +x, on the ground', () => {
    const box = new Box3().setFromBufferAttribute(busGeometry().getAttribute('position') as never);
    expect(box.max.x - box.min.x).toBeCloseTo(0.222, 3);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
  });

  it('traffic lines widen with trips and stop at 0.8', () => {
    expect(trafficWidth(0)).toBeCloseTo(0.15, 9);
    expect(trafficWidth(4)).toBeCloseTo(0.35, 9);
    expect(trafficWidth(100)).toBe(0.8);
  });
});

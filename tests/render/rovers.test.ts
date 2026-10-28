import { describe, expect, it } from 'vitest';
import { Group, type Vector3 } from 'three';
import { createCameraState } from '../../src/render/camera/globeCamera';
import { bandsTexture } from '../../src/render/materials';
import { RoverLayer } from '../../src/render/world/roverLayer';
import { LUNA_RADIUS } from '../../src/shared/scale';
import { createTerrain } from '../../src/shared/terrain';
import { pointAt, tripState, type Trip } from '../../src/shared/trips';
import { angleBetween, normalize, type Vec3 } from '../../src/shared/vec3';

/** A bus run north along a meridian, offset east by x. */
function run(id: number, x: number): Trip {
  const points: Vec3[] = [0, 0.03, 0.06].map((a) => normalize([x, Math.sin(a), Math.cos(a)]));
  return {
    id,
    sectionId: 0,
    departTick: 100,
    points,
    cum: points.map((p) => angleBetween(points[0]!, p) * LUNA_RADIUS),
    stops: [{ s: 5, buildingId: 7, workerIds: [1], dwell: 1 }],
    speed: 0.3,
    kind: 'toWork',
  };
}

const distanceTo = (dir: Vec3) => (at: Vector3) =>
  angleBetween(normalize([at.x, at.y, at.z]), dir) * LUNA_RADIUS;

describe('rover picking', () => {
  const layer = new RoverLayer(new Group(), createTerrain(42), LUNA_RADIUS, bandsTexture());
  const a = run(1, 0);
  const b = run(2, 0.05);
  layer.setTrips([a, b]);

  it('a tap picks the trip of the nearest shown bus, within reach', () => {
    layer.update(105, createCameraState(a.points[1]!, 3));
    const busB = pointAt(b.points, b.cum, tripState(b, 105)!.s).pos;
    expect(layer.nearest(distanceTo(busB), 0.5)).toBe(2);
    expect(layer.nearest(() => 1, 0.5)).toBeNull();
  });

  it('hidden buses cannot be picked', () => {
    layer.update(105, createCameraState(a.points[1]!, 60));
    expect(layer.nearest(() => 0, 0.5)).toBeNull();
  });
});

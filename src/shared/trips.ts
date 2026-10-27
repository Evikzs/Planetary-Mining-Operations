import { industrialEase } from './ease';
import { add, normalize, scale, sub, type Vec3 } from './vec3';

export interface TripStop {
  /** Distance along the path, in world units. */
  s: number;
  buildingId: number;
  workerIds: number[];
  dwell: number;
}

/** One bus run. The renderer places the bus from this alone, at any moment. */
export interface Trip {
  id: number;
  sectionId: number;
  departTick: number;
  /** Unit directions along the road. */
  points: Vec3[];
  /** Distance from the start to each point, in world units. */
  cum: number[];
  stops: TripStop[];
  /** World units per game minute. */
  speed: number;
  kind: 'toWork' | 'toHome';
}

/** Game minutes from departure until the last stop's dwell ends. */
export function tripDuration(trip: Pick<Trip, 'cum' | 'stops' | 'speed'>): number {
  const last = trip.stops[trip.stops.length - 1];
  return (last ? last.s / trip.speed : 0) + trip.stops.reduce((sum, x) => sum + x.dwell, 0);
}

/** Game time at which the bus reaches each stop. */
export function stopTimes(trip: Pick<Trip, 'departTick' | 'stops' | 'speed'>): number[] {
  let t = trip.departTick;
  let prev = 0;
  return trip.stops.map((stop) => {
    t += (stop.s - prev) / trip.speed;
    prev = stop.s;
    const at = t;
    t += stop.dwell;
    return at;
  });
}

export function tripState(
  trip: Pick<Trip, 'departTick' | 'cum' | 'stops' | 'speed'>,
  gameTime: number,
): { s: number; moving: boolean; stopIndex: number | null } | null {
  if (gameTime < trip.departTick) return null;
  let t = gameTime - trip.departTick;
  let prev = 0;
  for (let k = 0; k < trip.stops.length; k++) {
    const stop = trip.stops[k]!;
    const leg = (stop.s - prev) / trip.speed;
    if (t < leg) {
      return { s: prev + (stop.s - prev) * industrialEase(t / leg), moving: true, stopIndex: null };
    }
    t -= leg;
    if (t < stop.dwell) return { s: stop.s, moving: false, stopIndex: k };
    t -= stop.dwell;
    prev = stop.s;
  }
  // The bus stays parked at its last stop for one more minute.
  return t <= 1 ? { s: prev, moving: false, stopIndex: trip.stops.length - 1 } : null;
}

export function pointAt(points: Vec3[], cum: number[], s: number): { pos: Vec3; tangent: Vec3 } {
  const last = points.length - 1;
  if (last < 1) return { pos: points[0] ?? [0, 0, 1], tangent: [0, 0, 0] };
  const x = Math.min(cum[last]!, Math.max(0, s));
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  const span = cum[hi]! - cum[lo]!;
  const f = span > 0 ? (x - cum[lo]!) / span : 0;
  return { pos: normalize(add(a, scale(sub(b, a), f))), tangent: normalize(sub(b, a)) };
}

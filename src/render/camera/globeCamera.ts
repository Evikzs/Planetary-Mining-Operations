import {
  add,
  cross,
  dot,
  len,
  normalize,
  scale,
  sub,
  tangentBasis,
  type Vec3,
} from '../../shared/vec3';

/** Where the camera looks: a ground direction, the heading there, and the distance to it. */
export interface GlobeCameraState {
  pos: Vec3;
  fwd: Vec3;
  altitude: number;
  lockNorth: boolean;
}

/** Street level: 10 m over the ground (one unit is 40 m). */
export const MIN_ALTITUDE = 0.25;
export const MAX_ALTITUDE = 400;
/** Below this the camera leaves the bird's-eye view and tilts on towards the horizon. */
export const BIRD_EYE_ALTITUDE = 1.5;
const BIRD_TILT = (55 * Math.PI) / 180;
const STREET_TILT = (80 * Math.PI) / 180;
const FLAT_ALTITUDE = 60;
/** The camera keeps 2 m over the ground under its target. */
const MIN_CLEARANCE = 0.05;

const north = (pos: Vec3): Vec3 => tangentBasis(pos).north;

/** Rodrigues rotation of v about a unit axis. */
function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Unit pos, and fwd tangent to it; small rounding is removed after each move. */
function settle(pos: Vec3, fwd: Vec3): { pos: Vec3; fwd: Vec3 } {
  const p = normalize(pos);
  return { pos: p, fwd: normalize(sub(fwd, scale(p, dot(p, fwd)))) };
}

export function createCameraState(dir: Vec3, altitude: number): GlobeCameraState {
  const pos = normalize(dir);
  return { pos, fwd: north(pos), altitude: clampAltitude(altitude), lockNorth: true };
}

const clampAltitude = (a: number): number => Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, a));

/** Moves along the surface; the heading is carried along the great circle, or reset to north when locked. */
export function pan(
  s: GlobeCameraState,
  rightUnits: number,
  forwardUnits: number,
  radius: number,
): GlobeCameraState {
  const right = cross(s.fwd, s.pos);
  const move = add(scale(right, rightUnits), scale(s.fwd, forwardUnits));
  const dist = len(move);
  if (dist === 0) return s;
  const axis = normalize(cross(s.pos, move));
  const angle = dist / radius;
  const next = settle(rotateAbout(s.pos, axis, angle), rotateAbout(s.fwd, axis, angle));
  return { ...s, pos: next.pos, fwd: s.lockNorth ? north(next.pos) : next.fwd };
}

/** Turns the heading clockwise (seen from above) and lets go of north. */
export function rotate(s: GlobeCameraState, radians: number): GlobeCameraState {
  const fwd = settle(s.pos, rotateAbout(s.fwd, s.pos, -radians)).fwd;
  return { ...s, fwd, lockNorth: false };
}

export function setLockNorth(s: GlobeCameraState, on: boolean): GlobeCameraState {
  return { ...s, lockNorth: on, fwd: on ? north(s.pos) : s.fwd };
}

export function zoom(s: GlobeCameraState, factor: number): GlobeCameraState {
  return { ...s, altitude: clampAltitude(s.altitude * factor) };
}

/** The point `t` of the way along the great circle from a to b; opposite points turn about any axis. */
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
  if (angle < 1e-12) return b;
  let axis = cross(a, b);
  if (len(axis) < 1e-9) axis = cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  return rotateAbout(a, normalize(axis), angle * t);
}

/** The camera `t` of the way from one view to another: along the great circle, altitude eased in log space, north up. */
export function flyBetween(
  from: GlobeCameraState,
  to: GlobeCameraState,
  t: number,
): GlobeCameraState {
  const altitude = from.altitude * (to.altitude / from.altitude) ** t;
  return createCameraState(slerp(from.pos, to.pos, t), altitude);
}

/** The Moon turning under the camera: about its axis, so latitude and heading stay. */
export function spinAboutPole(s: GlobeCameraState, radians: number): GlobeCameraState {
  const axis: Vec3 = [0, 1, 0];
  const next = settle(rotateAbout(s.pos, axis, radians), rotateAbout(s.fwd, axis, radians));
  return { ...s, pos: next.pos, fwd: s.lockNorth ? north(next.pos) : next.fwd };
}

/** Radians clockwise from local north, in [0, 2π). */
export function heading(s: GlobeCameraState): number {
  const { east, north: n } = tangentBasis(s.pos);
  const turn = 2 * Math.PI;
  return (Math.atan2(dot(s.fwd, east), dot(s.fwd, n)) + turn) % turn;
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * 55° from straight down at bird's-eye altitude (1.5), easing to 0° by altitude 60; below 1.5 it
 * tilts on to 80° at street level, near the horizon. Both eases are smoothsteps in log altitude.
 */
export function tiltForAltitude(alt: number): number {
  if (alt < BIRD_EYE_ALTITUDE) {
    const x = Math.log(BIRD_EYE_ALTITUDE / alt) / Math.log(BIRD_EYE_ALTITUDE / MIN_ALTITUDE);
    return BIRD_TILT + (STREET_TILT - BIRD_TILT) * smooth(x);
  }
  const x = Math.log(alt / BIRD_EYE_ALTITUDE) / Math.log(FLAT_ALTITUDE / BIRD_EYE_ALTITUDE);
  return BIRD_TILT * (1 - smooth(x));
}

/** The camera sits `altitude` back from the ground target, tilted towards the heading. */
export function cameraPose(
  s: GlobeCameraState,
  radius: number,
  ground: number,
): { position: Vec3; target: Vec3; up: Vec3 } {
  const tilt = tiltForAltitude(s.altitude);
  const target = scale(s.pos, radius + ground);
  const back = sub(scale(s.pos, Math.cos(tilt)), scale(s.fwd, Math.sin(tilt)));
  let position = add(target, scale(back, s.altitude));
  const floor = radius + ground + MIN_CLEARANCE;
  if (len(position) < floor) position = scale(normalize(position), floor);
  // Screen-up leans from the heading (looking straight down) towards the sky (tilted).
  const lean = add(scale(s.pos, Math.sin(tilt)), scale(s.fwd, Math.cos(tilt)));
  const view = normalize(sub(target, position));
  const up = normalize(sub(lean, scale(view, dot(view, lean))));
  return { position, target, up };
}

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

export const MIN_ALTITUDE = 1.5;
export const MAX_ALTITUDE = 400;
const MAX_TILT = (55 * Math.PI) / 180;
const FLAT_ALTITUDE = 60;
const MIN_CLEARANCE = 0.5;

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

/** Radians clockwise from local north, in [0, 2π). */
export function heading(s: GlobeCameraState): number {
  const { east, north: n } = tangentBasis(s.pos);
  const turn = 2 * Math.PI;
  return (Math.atan2(dot(s.fwd, east), dot(s.fwd, n)) + turn) % turn;
}

/** 55° from straight down at the lowest altitude, easing to 0° by altitude 60 (smoothstep in log altitude). */
export function tiltForAltitude(alt: number): number {
  const x = Math.min(
    1,
    Math.max(0, Math.log(alt / MIN_ALTITUDE) / Math.log(FLAT_ALTITUDE / MIN_ALTITUDE)),
  );
  return MAX_TILT * (1 - x * x * (3 - 2 * x));
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

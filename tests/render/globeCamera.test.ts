import { describe, expect, it } from 'vitest';
import {
  cameraPose,
  createCameraState,
  heading,
  pan,
  rotate,
  setLockNorth,
  tiltForAltitude,
  zoom,
  type GlobeCameraState,
} from '../../src/render/camera/globeCamera';
import { createRng } from '../../src/sim/rng';
import { dot, fromLatLon, len, sub } from '../../src/shared/vec3';

const R = 100;
const deg = (d: number) => (d * Math.PI) / 180;

function expectValid(s: GlobeCameraState) {
  expect(Math.abs(len(s.pos) - 1)).toBeLessThan(1e-9);
  expect(Math.abs(len(s.fwd) - 1)).toBeLessThan(1e-9);
  expect(Math.abs(dot(s.fwd, s.pos))).toBeLessThan(1e-9);
}

describe('globe camera', () => {
  it('pan keeps |pos| = 1 and fwd ⟂ pos', () => {
    const rng = createRng(3);
    let s = createCameraState(fromLatLon(deg(-70), deg(20)), 4);
    for (let i = 0; i < 500; i++) {
      if (i === 250) s = setLockNorth(s, false);
      s = pan(s, (rng.next() - 0.5) * 20, (rng.next() - 0.5) * 20, R);
      expectValid(s);
    }
  });

  it('panning 2πR forward returns to the start (1e-6)', () => {
    const start = setLockNorth(createCameraState(fromLatLon(deg(35), deg(-50)), 4), false);
    let s = start;
    for (let i = 0; i < 360; i++) s = pan(s, 0, (2 * Math.PI * R) / 360, R);
    expect(len(sub(s.pos, start.pos))).toBeLessThan(1e-6);
    expect(len(sub(s.fwd, start.fwd))).toBeLessThan(1e-6);
  });

  it('crossing the north pole with lock north gives no NaN and heading 0', () => {
    let s = createCameraState(fromLatLon(deg(89.5), deg(10)), 2);
    for (let i = 0; i < 40; i++) {
      s = pan(s, 0, 0.05, R);
      expectValid(s);
      expect(heading(s)).toBeCloseTo(0, 9);
    }
    const pole = createCameraState([0, 1, 0], 2);
    expectValid(pole);
    expect(heading(pole)).toBeCloseTo(0, 9);
  });

  it('rotate then lock north gives heading 0', () => {
    const s = rotate(createCameraState(fromLatLon(deg(-60), deg(100)), 4), deg(70));
    expect(s.lockNorth).toBe(false);
    expect(heading(s)).toBeCloseTo(deg(70), 9);
    const locked = setLockNorth(s, true);
    expect(locked.lockNorth).toBe(true);
    expect(heading(locked)).toBeCloseTo(0, 9);
  });

  it('zoom clamps to [1.5, 400]; tilt is 55° at 1.5 and 0° at 60', () => {
    const s = createCameraState([1, 0, 0], 10);
    expect(zoom(s, 0.01).altitude).toBe(1.5);
    expect(zoom(s, 1000).altitude).toBe(400);
    expect(zoom(s, 2).altitude).toBe(20);
    expect(tiltForAltitude(1.5)).toBeCloseTo(deg(55), 9);
    expect(tiltForAltitude(1)).toBeCloseTo(deg(55), 9);
    expect(tiltForAltitude(60)).toBe(0);
    expect(tiltForAltitude(200)).toBe(0);
    const mid = tiltForAltitude(Math.sqrt(1.5 * 60));
    expect(mid).toBeCloseTo(deg(27.5), 9);
  });

  it('pose never goes below ground + 0.5', () => {
    for (const ground of [-1.2, 0, 1.6, 30]) {
      for (const alt of [1.5, 3, 20, 400]) {
        const s = createCameraState(fromLatLon(deg(-75), deg(40)), alt);
        const pose = cameraPose(s, R, ground);
        expect(len(pose.position)).toBeGreaterThanOrEqual(R + ground + 0.5 - 1e-9);
        expect(Math.abs(len(pose.target) - (R + ground))).toBeLessThan(1e-9);
        expect(Math.abs(dot(pose.up, sub(pose.target, pose.position)))).toBeLessThan(1e-6);
      }
    }
  });
});

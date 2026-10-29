import type { MotionPref } from './store';

const MOTION_KEY = 'pmo.reducedMotion';

/** The saved reduced-motion choice; 'system' when none was saved or storage is blocked. */
export function loadMotionPref(): MotionPref {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    return v === 'on' || v === 'off' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function saveMotionPref(pref: MotionPref): void {
  try {
    localStorage.setItem(MOTION_KEY, pref);
  } catch {
    // Storage is blocked (private mode): the choice lasts until the page closes.
  }
}

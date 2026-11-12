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

const OFFLINE_KEY = 'pmo.offlineCatchUp';

/** Whether the world runs while the game is closed; on unless the player turned it off. */
export function loadOfflinePref(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveOfflinePref(on: boolean): void {
  try {
    localStorage.setItem(OFFLINE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage is blocked (private mode): the choice lasts until the page closes.
  }
}

export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export type UiScale = (typeof UI_SCALES)[number];
const SCALE_KEY = 'pmo.uiScale';

/** The saved interface size; with none, 90% in a window under 1440 px wide, else 100%. */
export function loadUiScale(windowWidth: number): UiScale {
  try {
    const saved = Number(localStorage.getItem(SCALE_KEY));
    const known = UI_SCALES.find((s) => s === saved);
    if (known !== undefined) return known;
  } catch {
    // Storage is blocked: fall through to the default.
  }
  return windowWidth < 1440 ? 0.9 : 1;
}

export function saveUiScale(scale: UiScale): void {
  try {
    localStorage.setItem(SCALE_KEY, String(scale));
  } catch {
    // Storage is blocked (private mode): the choice lasts until the page closes.
  }
}

import { pan, rotate, setLockNorth, zoom, type GlobeCameraState } from './globeCamera';

export interface CameraController {
  readonly state: GlobeCameraState;
  set(s: GlobeCameraState): void;
  /** Applies held keys and pan inertia; true when the camera changed since the last update. */
  update(dtMs: number): boolean;
  dispose(): void;
}

export interface ControllerOptions {
  radius: number;
  reducedMotion: boolean;
  onTap(x: number, y: number): void;
  onGesture(kind: 'panned' | 'zoomed'): void;
}

const TAP_MOVE_PX = 6;
const TAP_MS = 300;
const PAN_PER_PX = 1.15; // altitudes per canvas height
const KEY_PAN = 0.6; // altitudes per second
const KEY_TURN = Math.PI / 2; // radians per second
const KEY_ZOOM = 2; // factor per second
const WHEEL_BASE = 1.0015;
const INERTIA_MS = 250;
const FLICK_WINDOW_MS = 80;
// A pinch always twists a little; rotation starts only past this, so lock north survives zooming.
const TWIST_START = (10 * Math.PI) / 180;

const KEY_OF: Record<string, string> = {
  w: 'w',
  a: 'a',
  s: 's',
  d: 'd',
  q: 'q',
  e: 'e',
  '+': 'in',
  '=': 'in',
  '-': 'out',
  _: 'out',
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Drag, pinch, twist, wheel and keys on `el` move the globe camera. */
export function createCameraController(
  el: HTMLElement,
  initial: GlobeCameraState,
  o: ControllerOptions,
): CameraController {
  let state = initial;
  let changed = true;
  const pointers = new Map<number, { x: number; y: number }>();
  let tap: { id: number; t: number; travel: number } | null = null;
  let twist = 0;
  let twisting = false;
  let velocity = { right: 0, forward: 0 }; // world units per ms
  const flick: { t: number; right: number; forward: number }[] = [];
  const held = new Set<string>();

  const unitsPerPx = (): number => (state.altitude * PAN_PER_PX) / Math.max(1, el.clientHeight);
  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const panBy = (right: number, forward: number): void => {
    state = pan(state, right, forward, o.radius);
    changed = true;
  };

  function onDown(e: PointerEvent): void {
    pointers.set(e.pointerId, local(e));
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; the drag still works inside the canvas.
    }
    velocity = { right: 0, forward: 0 };
    flick.length = 0;
    twist = 0;
    twisting = false;
    tap = pointers.size === 1 ? { id: e.pointerId, t: e.timeStamp, travel: 0 } : null;
  }

  function onMove(e: PointerEvent): void {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const next = local(e);
    pointers.set(e.pointerId, next);
    if (tap?.id === e.pointerId) tap.travel += Math.hypot(next.x - prev.x, next.y - prev.y);
    const k = unitsPerPx();
    if (pointers.size === 1) {
      const right = -(next.x - prev.x) * k;
      const forward = (next.y - prev.y) * k;
      panBy(right, forward);
      flick.push({ t: e.timeStamp, right, forward });
      o.onGesture('panned');
      return;
    }
    const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
    if (!other || pointers.size !== 2) return;
    // The midpoint moves half as far as the finger that moved.
    panBy((-(next.x - prev.x) / 2) * k, ((next.y - prev.y) / 2) * k);
    const before = Math.hypot(prev.x - other.x, prev.y - other.y);
    const after = Math.hypot(next.x - other.x, next.y - other.y);
    if (before > 0 && after > 0) {
      state = zoom(state, before / after);
      o.onGesture('zoomed');
    }
    // Fingers turning clockwise on screen turn the map clockwise, so the heading turns back.
    const turn = wrap(
      Math.atan2(next.y - other.y, next.x - other.x) -
        Math.atan2(prev.y - other.y, prev.x - other.x),
    );
    twist += turn;
    if (!twisting && Math.abs(twist) > TWIST_START) {
      twisting = true;
      state = rotate(state, -twist);
    } else if (twisting) state = rotate(state, -turn);
  }

  function onUp(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) return;
    if (tap?.id === e.pointerId && tap.travel < TAP_MOVE_PX && e.timeStamp - tap.t < TAP_MS) {
      const p = local(e);
      o.onTap(p.x, p.y);
    }
    tap = null;
    if (pointers.size > 0 || o.reducedMotion) return;
    const recent = flick.filter((f) => f.t >= e.timeStamp - FLICK_WINDOW_MS);
    if (recent.length >= 2) {
      const span = e.timeStamp - recent[0]!.t + 16;
      velocity = {
        right: recent.reduce((sum, f) => sum + f.right, 0) / span,
        forward: recent.reduce((sum, f) => sum + f.forward, 0) / span,
      };
    }
    flick.length = 0;
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
    state = zoom(state, WHEEL_BASE ** (e.deltaY * lines));
    changed = true;
    o.onGesture('zoomed');
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === 'n') {
      if (!e.repeat) {
        state = setLockNorth(state, !state.lockNorth);
        changed = true;
      }
      return;
    }
    const name = KEY_OF[key];
    if (name) held.add(name);
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    const key = KEY_OF[e.key.toLowerCase()];
    if (key) held.delete(key);
  };
  const onBlur = (): void => held.clear();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    get state() {
      return state;
    },
    set(s) {
      state = s;
      velocity = { right: 0, forward: 0 };
      changed = true;
    },
    update(dtMs) {
      const sec = dtMs / 1000;
      const on = (k: string): number => (held.has(k) ? 1 : 0);
      const step = KEY_PAN * state.altitude * sec;
      const right = (on('d') - on('a')) * step;
      const forward = (on('w') - on('s')) * step;
      if (right || forward) {
        panBy(right, forward);
        o.onGesture('panned');
      }
      const turn = on('e') - on('q');
      if (turn) {
        state = rotate(state, turn * KEY_TURN * sec);
        changed = true;
      }
      const out = on('out') - on('in');
      if (out) {
        state = zoom(state, KEY_ZOOM ** (out * sec));
        changed = true;
        o.onGesture('zoomed');
      }
      if (velocity.right || velocity.forward) {
        panBy(velocity.right * dtMs, velocity.forward * dtMs);
        const decay = Math.exp(-dtMs / INERTIA_MS);
        velocity = { right: velocity.right * decay, forward: velocity.forward * decay };
        if (Math.hypot(velocity.right, velocity.forward) * 1000 < state.altitude * 0.01) {
          velocity = { right: 0, forward: 0 };
        }
      }
      const was = changed;
      changed = false;
      return was;
    },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}

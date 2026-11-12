import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCameraController } from '../../src/render/camera/controller';
import { createCameraState } from '../../src/render/camera/globeCamera';
import { angleBetween, fromLatLon } from '../../src/shared/vec3';

/** A canvas stand-in: 800×600 at the page origin, taking synthetic pointer events. */
function fakeCanvas() {
  const el = new EventTarget() as EventTarget & Record<string, unknown>;
  Object.assign(el, {
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => undefined,
  });
  return el as unknown as HTMLElement;
}

let t = 0;
function pointer(type: string, id: number, x: number, y: number, button = 0): Event {
  const e = new Event(type);
  const props = { pointerId: id, clientX: x, clientY: y, button, timeStamp: (t += 16) };
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
  return e;
}

function setup() {
  const el = fakeCanvas();
  const onTap = vi.fn();
  const onCancel = vi.fn();
  const start = createCameraState(fromLatLon(0.3, 0.2), 10);
  const c = createCameraController(el, start, {
    radius: 100,
    reducedMotion: true,
    onTap,
    onCancel,
    onGesture: () => undefined,
  });
  return { el, c, start, onTap, onCancel };
}

beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

describe('camera controller, mouse', () => {
  it('right-drag turns the heading and does not pan', () => {
    const { el, c, start } = setup();
    el.dispatchEvent(pointer('pointerdown', 1, 400, 300, 2));
    el.dispatchEvent(pointer('pointermove', 1, 500, 300, 2));
    el.dispatchEvent(pointer('pointerup', 1, 500, 300, 2));
    expect(c.state.pos).toEqual(start.pos);
    expect(angleBetween(c.state.fwd, start.fwd)).toBeCloseTo(0.5, 3);
  });

  it('left-drag pans', () => {
    const { el, c, start } = setup();
    el.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    el.dispatchEvent(pointer('pointermove', 1, 450, 300));
    el.dispatchEvent(pointer('pointerup', 1, 450, 300));
    expect(c.state.pos).not.toEqual(start.pos);
  });

  it('a second pointer neither zooms nor turns', () => {
    const { el, c, start } = setup();
    el.dispatchEvent(pointer('pointerdown', 1, 300, 300));
    el.dispatchEvent(pointer('pointerdown', 2, 500, 300));
    el.dispatchEvent(pointer('pointermove', 2, 600, 400));
    expect(c.state.altitude).toBe(start.altitude);
    expect(angleBetween(c.state.fwd, start.fwd)).toBeCloseTo(0, 9);
  });

  it('a right-click without travel calls onCancel, not onTap', () => {
    const { el, onTap, onCancel } = setup();
    el.dispatchEvent(pointer('pointerdown', 1, 400, 300, 2));
    el.dispatchEvent(pointer('pointerup', 1, 401, 300, 2));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onTap).not.toHaveBeenCalled();
  });

  it('a left click without travel calls onTap', () => {
    const { el, onTap, onCancel } = setup();
    el.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    el.dispatchEvent(pointer('pointerup', 1, 400, 300));
    expect(onTap).toHaveBeenCalledWith(400, 300);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

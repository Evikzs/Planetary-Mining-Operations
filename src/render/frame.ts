/** Per-frame math the renderer runs: clip planes, interpolated game time, pixel ratio. */

export function clipPlanes(altitude: number, radius: number): { near: number; far: number } {
  return { near: Math.max(0.02, altitude / 50), far: altitude + 3 * radius };
}

/** Game minutes at nowMs: the tick plus the fraction of the minute since it was due, capped at one. */
export function gameTimeAt(
  tick: number,
  anchorRealMs: number,
  timescale: number,
  nowMs: number,
): number {
  const fraction = ((nowMs - anchorRealMs) * timescale) / 1000;
  return tick + Math.min(1, Math.max(0, fraction));
}

const SLOW_MS = 20;
const FAST_MS = 12;
const SLOW_FOR_MS = 2000;
const FAST_FOR_MS = 5000;
// One stalled frame is a hitch, not a slow device: count at most this much of it.
const MAX_FRAME_MS = 250;

/** Lowers the pixel ratio while frames stay slow and raises it back while they stay fast. */
export function createDprController(max: number) {
  let value = max;
  let avg = 1000 / 60;
  let slowFor = 0;
  let fastFor = 0;
  return {
    get value() {
      return value;
    },
    get frameMsAvg() {
      return avg;
    },
    /** Takes one frame interval; returns the new ratio when it changes. */
    update(frameMs: number): number | null {
      const ms = Math.min(frameMs, MAX_FRAME_MS);
      avg += (ms - avg) * 0.1;
      slowFor = avg > SLOW_MS ? slowFor + ms : 0;
      fastFor = avg < FAST_MS ? fastFor + ms : 0;
      if (slowFor >= SLOW_FOR_MS && value > 1) {
        value = Math.max(1, value - 0.25);
        slowFor = 0;
        return value;
      }
      if (fastFor >= FAST_FOR_MS && value < max) {
        value = Math.min(max, value + 0.25);
        fastFor = 0;
        return value;
      }
      return null;
    },
  };
}

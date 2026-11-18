import { minuteOfDay } from '../sim/clock';
import type { Vec3 } from '../shared/vec3';

/**
 * The sun over the Moon. One lunar day is one game day, so the clock reads local solar time at a
 * reference longitude (the player's charter hub). The sun stands over the equator: near the
 * poles it stays low all day.
 */

const HOUR = Math.PI / 12;

/** Longitude under the sun at game time `minutes` (fractional ticks). */
export function subsolarLon(minutes: number, refLon: number): number {
  return refLon - (minuteOfDay(minutes) / 60 - 12) * HOUR;
}

/** Unit vector from the Moon's centre to the sun. */
export function sunDirection(minutes: number, refLon: number): Vec3 {
  const lon = subsolarLon(minutes, refLon);
  return [Math.sin(lon), 0, Math.cos(lon)];
}

/** Local solar time, 0 to 24, at a longitude. */
export function localHour(lon: number, minutes: number, refLon: number): number {
  const h = 12 + (lon - subsolarLon(minutes, refLon)) / HOUR;
  return ((h % 24) + 24) % 24;
}

/** Share of windows lit at a local hour: most in the evening, fewest before dawn. */
export const windowsLit = (hour: number): number =>
  0.55 + 0.3 * Math.cos(((hour - 20) / 24) * 2 * Math.PI);

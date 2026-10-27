export const TICKS_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_DAY = TICKS_PER_HOUR * HOURS_PER_DAY;
export const DAYS_PER_YEAR = 365;
export const SHIFT_START_HOURS = [6, 14, 22] as const;
export const START = { year: 2091, month: 3, day: 1, hour: 5 } as const;

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
// Minutes from Jan 1 00:00 of START.year to tick 0.
const START_OFFSET =
  (MONTH_DAYS.slice(0, START.month - 1).reduce((a, b) => a + b, 0) + START.day - 1) *
    TICKS_PER_DAY +
  START.hour * TICKS_PER_HOUR;

export interface GameDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function tickToDate(tick: number): GameDate {
  const abs = START_OFFSET + tick;
  const year = START.year + Math.floor(abs / TICKS_PER_YEAR);
  const inYear = abs - (year - START.year) * TICKS_PER_YEAR;
  let dayOfYear = Math.floor(inYear / TICKS_PER_DAY);
  const minuteOfDay = inYear - dayOfYear * TICKS_PER_DAY;
  let month = 0;
  while (dayOfYear >= (MONTH_DAYS[month] ?? 31)) {
    dayOfYear -= MONTH_DAYS[month] ?? 31;
    month++;
  }
  return {
    year,
    month: month + 1,
    day: dayOfYear + 1,
    hour: Math.floor(minuteOfDay / TICKS_PER_HOUR),
    minute: minuteOfDay % TICKS_PER_HOUR,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatGameDate(tick: number): string {
  const d = tickToDate(tick);
  return `${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}`;
}

/** Minute of the day (0..1439) at a tick. */
export function minuteOfDay(tick: number): number {
  const m = (START.hour * TICKS_PER_HOUR + tick) % TICKS_PER_DAY;
  return m < 0 ? m + TICKS_PER_DAY : m;
}

const SHIFT_MINUTES = SHIFT_START_HOURS.map((h) => h * TICKS_PER_HOUR);

export function shiftAt(tick: number): 0 | 1 | 2 {
  const m = minuteOfDay(tick);
  if (m >= SHIFT_MINUTES[2]! || m < SHIFT_MINUTES[0]!) return 2;
  return m >= SHIFT_MINUTES[1]! ? 1 : 0;
}

/** The shift that starts exactly at this tick, if any. */
export function shiftStartingAt(tick: number): 0 | 1 | 2 | null {
  const i = SHIFT_MINUTES.indexOf(minuteOfDay(tick));
  return i < 0 ? null : (i as 0 | 1 | 2);
}

export function nextShiftStartTick(tick: number): number {
  const m = minuteOfDay(tick);
  const next = SHIFT_MINUTES.find((s) => s > m) ?? SHIFT_MINUTES[0]! + TICKS_PER_DAY;
  return tick + (next - m);
}

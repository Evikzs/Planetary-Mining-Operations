const grouped = (n: number, decimals = 0): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** 'LM 1,234.56'; negative amounts take a true minus sign: '−LM 12.00'. */
export function formatMoney(cents: number): string {
  const text = `LM ${grouped(Math.abs(cents) / 100, 2)}`;
  return cents < 0 ? `−${text}` : text;
}

/** '850 kg', '4.25 t', '12.3 t', '1,240 t'. */
export function formatMass(kg: number): string {
  if (Math.abs(kg) < 1000) return `${Math.round(kg)} kg`;
  const t = kg / 1000;
  const decimals = Math.abs(t) < 10 ? 2 : Math.abs(t) < 100 ? 1 : 0;
  return `${grouped(t, decimals)} t`;
}

/** Game time: '3 d 4 h', '4 h 12 min', '35 min'. */
export function formatGameDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

/** The real wait for a span of game time: one game minute passes in one real second. */
export function formatRealFromGame(minutes: number): string {
  const real = Math.max(1, Math.round(minutes / 60));
  const hours = Math.floor(real / 60);
  return hours > 0 ? `≈ ${hours} h ${real % 60} min` : `≈ ${real} min`;
}

/** The latest price against 24 hours before it: up or down past 2%, else flat. */
export function trendOf(history: number[]): 'up' | 'down' | 'flat' {
  if (history.length < 25) return 'flat';
  const ratio = history[history.length - 1]! / history[history.length - 25]!;
  return ratio > 1.02 ? 'up' : ratio < 0.98 ? 'down' : 'flat';
}

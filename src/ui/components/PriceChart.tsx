import { formatGameDuration, formatMoney } from '../format';

const W = 320;
const H = 120;

/** Chart coordinates of a price history: oldest at x = 0, newest at x = width, highest at y = 0. */
export function chartPoints(history: number[], width: number, height: number): [number, number][] {
  const lo = Math.min(...history);
  const hi = Math.max(...history);
  const n = history.length;
  return history.map((v, i) => [
    n > 1 ? (i / (n - 1)) * width : width,
    hi === lo ? height / 2 : height - ((v - lo) / (hi - lo)) * height,
  ]);
}

/** One price per game hour, newest last, as a line over a grid of game days. */
export function PriceChart({ history, label }: { history: number[]; label: string }) {
  const n = history.length;
  if (n === 0) return null;
  const points = chartPoints(history, W, H);
  // A day line every 24 entries, counted back from the newest.
  const days = Array.from(
    { length: Math.floor((n - 1) / 24) },
    (_, k) => points[n - 1 - 24 * (k + 1)]![0],
  );
  return (
    <figure class="chart">
      <span class="num hi">{formatMoney(Math.max(...history))}</span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} class="grid" x1={0} x2={W} y1={H * f} y2={H * f} />
        ))}
        {days.map((x) => (
          <line key={x} class="grid" x1={x} x2={x} y1={0} y2={H} />
        ))}
        <polyline class="line" points={points.map(([x, y]) => `${x},${y}`).join(' ')} />
      </svg>
      <span class="num lo">{formatMoney(Math.min(...history))}</span>
      <figcaption class="num">
        <span>{n > 1 ? `${formatGameDuration((n - 1) * 60)} ago` : ''}</span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}

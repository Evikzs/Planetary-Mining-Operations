/** A CSS cubic-bezier timing function: progress in, eased progress out. */
export function cubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const curve = (p1: number, p2: number, u: number) =>
    ((1 + 3 * p1 - 3 * p2) * u + (3 * p2 - 6 * p1)) * u * u + 3 * p1 * u;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (curve(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return curve(y1, y2, (lo + hi) / 2);
  };
}

/** Machines: slow off the mark, quick through the middle, a soft stop. */
export const industrialEase = cubicBezierEase(0.65, 0, 0.25, 1);

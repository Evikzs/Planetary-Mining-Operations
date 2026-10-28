import gsap from 'gsap';
import { EASE } from './eases';

interface Point {
  x: number;
  y: number;
}

/** The bend of a token's flight: the midpoint, raised by 30% of the distance. */
export function flightControl(from: Point, to: Point): Point {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 0.3 * d };
}

export function bezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Flies a mustard '+LM x' token from where the money was made to the cash readout. */
export function flyIncome(from: Point, to: Point, text: string): void {
  const token = document.createElement('div');
  token.className = 'income-token';
  token.textContent = text;
  token.setAttribute('aria-hidden', 'true');
  document.body.appendChild(token);
  const bend = flightControl(from, to);
  const at = { t: 0 };
  const place = (): void => {
    const p = bezierPoint(from, bend, to, at.t);
    token.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  };
  place();
  gsap.to(at, {
    t: 1,
    duration: 0.9,
    ease: EASE.flight,
    onUpdate: place,
    onComplete: () => token.remove(),
  });
}

import { industrialEase } from '../../shared/ease';

/** GSAP eases: panels settle with a small overshoot, machines move on the industrial curve,
 * numbers roll up and slow into place. */
export const EASE = {
  panel: 'back.out(1.2)',
  industrial: industrialEase,
  flight: 'power2.inOut',
  roll: 'power2.out',
} as const;

import type { RawGoodId } from '../../sim/world/types';

/**
 * Sol, drawn as Fable drew Halde: one scene, compressed. Units are Fable's (worlds of a few
 * thousand, orbits of a few million), periods are game days. Only Luna has ground you can go to;
 * the rest wait for later milestones.
 */
export interface Air {
  /** 0 = none (stars at noon), 1 = thick (no stars by day). */
  density: number;
  height: number;
  zenith: string;
  horizon: string;
  sunset: string;
  rim: string;
}

export interface BodyDef {
  id: string;
  name: string;
  kind: 'rock' | 'gas';
  blurb: string;
  /** What the company can do there now. */
  status: string;
  radius: number;
  /** Around the Sun, or around `parent`. */
  orbit: number;
  parent?: string;
  /** Game days for one orbit; for one turn (negative: backwards); null: one face to its parent. */
  period: number;
  day: number | null;
  phase: number;
  tilt: number;
  seed: number;
  palette: { low: string; high: string; accent: string };
  ore: RawGoodId | null;
  air: Air | null;
  rings?: boolean;
  /** The one world the game plays on. */
  landable?: boolean;
}

export const SUN = { name: 'Sol', radius: 3e4, color: '#ffe2ae' } as const;

export const SOL: BodyDef[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    kind: 'rock',
    blurb: 'First world of Sol. Baked by day, frozen by night.',
    status: 'No licence yet',
    radius: 2400,
    orbit: 0.55e6,
    period: 88,
    day: 58.6,
    phase: 2.1,
    tilt: 0,
    seed: 7.3,
    palette: { low: '#2b2724', high: '#7b7068', accent: '#5a4b3f' },
    ore: null,
    air: null,
  },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'gas',
    blurb: 'Second world of Sol. Clouds of acid over a surface hot enough to melt lead.',
    status: 'No licence yet',
    radius: 5600,
    orbit: 0.85e6,
    period: 225,
    day: -243,
    phase: 4.4,
    tilt: 0.05,
    seed: 13.1,
    palette: { low: '#a88a52', high: '#e6cf98', accent: '#c9a467' },
    ore: null,
    air: {
      density: 1,
      height: 600,
      zenith: '#c9a467',
      horizon: '#e6cf98',
      sunset: '#d0803f',
      rim: '#ecd39a',
    },
  },
  {
    id: 'earth',
    name: 'Earth',
    kind: 'rock',
    blurb: 'Third world of Sol. A market, not a mine: everything you make is sold here.',
    status: 'Markets only',
    radius: 6000,
    orbit: 1.2e6,
    period: 365,
    day: 1,
    phase: 5.6,
    tilt: 0.41,
    seed: 21.7,
    palette: { low: '#14304f', high: '#5f6b4a', accent: '#e9ecef' },
    ore: null,
    air: {
      density: 0.9,
      height: 500,
      zenith: '#3f7fc4',
      horizon: '#bcd6ea',
      sunset: '#f0894a',
      rim: '#7fb8ea',
    },
  },
  {
    id: 'luna',
    name: 'Luna',
    kind: 'rock',
    blurb: 'The Moon of Earth. No air, long shadows, and the first charters of the age.',
    status: 'Your charter',
    radius: 1700,
    orbit: 26000,
    parent: 'earth',
    period: 27.3,
    day: null,
    phase: 0.9,
    tilt: 0,
    seed: 4.2,
    palette: { low: '#3e3e44', high: '#8c877f', accent: '#55534f' },
    ore: 'kreep',
    air: null,
    landable: true,
  },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'rock',
    blurb: 'Fourth world of Sol. Rust and thin cold air. The next charters go here.',
    status: 'No licence yet',
    radius: 3400,
    orbit: 1.75e6,
    period: 687,
    day: 1.03,
    phase: 0.6,
    tilt: 0.44,
    seed: 33.9,
    palette: { low: '#3a1f17', high: '#a8553a', accent: '#d8a07a' },
    ore: null,
    air: {
      density: 0.3,
      height: 300,
      zenith: '#6a5446',
      horizon: '#c9a58a',
      sunset: '#5f8fc0',
      rim: '#d9a689',
    },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'gas',
    blurb: 'Fifth world of Sol. A giant of storms; its moons hold ice and sulphur.',
    status: 'No licence yet',
    radius: 16000,
    orbit: 2.7e6,
    period: 4333,
    day: 0.41,
    phase: 3.2,
    tilt: 0.05,
    seed: 5.1,
    palette: { low: '#6f5440', high: '#d9c3a0', accent: '#a0583a' },
    ore: null,
    air: {
      density: 1,
      height: 900,
      zenith: '#b89a74',
      horizon: '#e3cfa6',
      sunset: '#c2703f',
      rim: '#e0c99c',
    },
  },
  {
    id: 'saturn',
    name: 'Saturn',
    kind: 'gas',
    blurb: 'Sixth world of Sol, in its rings. Titan circles it under an amber haze.',
    status: 'No licence yet',
    radius: 13500,
    orbit: 3.5e6,
    period: 10759,
    day: 0.44,
    phase: 1.4,
    tilt: 0.47,
    seed: 9.7,
    palette: { low: '#8a744f', high: '#e2d1a2', accent: '#b49a66' },
    ore: null,
    air: {
      density: 1,
      height: 900,
      zenith: '#c7b07c',
      horizon: '#ece0b8',
      sunset: '#c9874a',
      rim: '#eadcae',
    },
    rings: true,
  },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'gas',
    blurb: 'Seventh world of Sol. Pale, cold, and lying on its side.',
    status: 'No licence yet',
    radius: 8500,
    orbit: 4.3e6,
    period: 30687,
    day: -0.72,
    phase: 5.0,
    tilt: 1.7,
    seed: 17.4,
    palette: { low: '#6fa7b0', high: '#b6dfe2', accent: '#8cc3c9' },
    ore: null,
    air: {
      density: 1,
      height: 700,
      zenith: '#8cc3c9',
      horizon: '#cdebec',
      sunset: '#7fa9b0',
      rim: '#bfe6ea',
    },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'gas',
    blurb: 'Eighth world of Sol. Deep blue, with the fastest winds of all.',
    status: 'No licence yet',
    radius: 8200,
    orbit: 5.0e6,
    period: 60190,
    day: 0.67,
    phase: 2.6,
    tilt: 0.49,
    seed: 27.2,
    palette: { low: '#1f3f8a', high: '#4f7fd0', accent: '#2c5bb0' },
    ore: null,
    air: {
      density: 1,
      height: 700,
      zenith: '#3f6fc4',
      horizon: '#8fb3e8',
      sunset: '#4f6fb0',
      rim: '#7fa8ea',
    },
  },
];

export const bodyById = (id: string): BodyDef | undefined => SOL.find((b) => b.id === id);

/** Stars by day: thick air hides them. As Fable's rule: density at or above about 0.74. */
export const starsByDay = (b: BodyDef): boolean => !b.air || b.air.density < 0.74;

/** 'None', 'Very thin', 'Thin', 'Thick'. */
export const airWord = (b: BodyDef): string =>
  !b.air ? 'None' : b.air.density > 0.8 ? 'Thick' : b.air.density > 0.5 ? 'Thin' : 'Very thin';

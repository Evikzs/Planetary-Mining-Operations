import type { CompanyColour } from '../data/companies';

/**
 * Fable's design tokens, one source for the HUD (as CSS variables) and the 3D scene.
 * Mostly dark. Three kinds of light: amber for what people built, green for what keeps them
 * alive, and the ore colour of a mineral for what they came to find (finds only, never plain UI).
 */
export const ink = {
  night: '#06070a', // behind everything
  pit: '#0c0d11', // deepest surface
  slate: '#1b1e25', // raised surface
  chalk: '#ece6da', // primary text
  dust: '#a39a8c', // secondary text
  lamp: '#f2a93b', // work light: controls, focus, everything people built
  brass: '#b08d4c', // hairlines, orbit lines
  verdant: '#58c7a3', // life support, gains
  hazard: '#e2542b', // losses, alerts
} as const;

/** Paint and light for the colony kit. Glow pairs are [colour, strength]. */
export const kit = {
  ceramic: '#b5ac9c',
  ceramicDark: '#8a8276',
  steel: '#5d6166',
  steelDark: '#32353a',
  orange: '#d2622a',
  ochre: '#c28a2c',
  rust: '#7c4a34',
  teal: '#2f6f6a',
  glass: '#18222b',
  roof: '#c6beaf',
  road: '#1d1d23',
  tyre: '#17181b',
  panel: '#172338',
  bone: '#e8e2d6',
  growGlass: '#7fb8a2',
  glowWindow: ['#ffc56e', 1.25],
  glowWork: ['#ffab3d', 2.3],
  glowCool: ['#cfe6ff', 1.3],
  glowLife: ['#63e0b0', 1.3],
  glowRed: ['#ff3b2f', 2.2],
  glowFurnace: ['#ff7a2a', 1.6],
} as const;

export type Glow = readonly [string, number];

/** Suit colours of workers by skill: miner, technician, engineer. */
export const SUITS = ['#e06a26', '#3f8f8a', '#6f86a8'] as const;

/**
 * Map liveries. The ids are the old poster names, kept because saves hold them; the colours are
 * new, picked to read as washes on the grey Moon and apart from the ore colours.
 */
export const livery: Record<CompanyColour, string> = {
  burntOrange: '#e07a32',
  teal: '#3d9a92',
  mustard: '#c9a640',
  dustyPink: '#b98aa0',
  rust: '#a4553a',
  navy: '#6f86a8',
};

export const font = {
  display: '"Besley", "Rockwell", "Roboto Slab", Georgia, serif',
  text: '"Barlow", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
} as const;

export const space = [0, 4, 8, 12, 16, 24, 32, 48] as const;
export const radius = { card: 3, control: 2, pill: 999 } as const;
export const motion = {
  fastMs: 120,
  baseMs: 220,
  slowMs: 420,
  industrial: 'cubic-bezier(0.65, 0, 0.25, 1)',
} as const;

// shortcut: the poster palette stays only until the 3D layers move to `ink` and `kit`; it goes
// with them in the same change.
export const palette = {
  navy: '#1B2A41',
  burntOrange: '#C8551F',
  mustard: '#E1A730',
  teal: '#2A7F7A',
  cream: '#F2E8D5',
  rust: '#9C3D23',
  offBlack: '#1A1A1A',
  dustyPink: '#D89A8E',
} as const;
export const bodyAccent = { luna: '#9A9A94' } as const;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Linear blend of two sRGB hex colours; t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return (
    '#' +
    A.map((v, i) =>
      Math.round(v + ((B[i] ?? v) - v) * t)
        .toString(16)
        .padStart(2, '0'),
    ).join('')
  );
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio. */
export function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Sets the tokens as CSS variables: --chalk, --lamp, ..., --co-teal, --font-display, ... */
export function applyTokens(root: HTMLElement): void {
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(ink)) set(`--${k}`, v);
  for (const [k, v] of Object.entries(livery)) set(`--co-${k}`, v);
  set('--font-display', font.display);
  set('--font-text', font.text);
  set('--font-mono', font.mono);
  space.forEach((v, i) => set(`--space-${i}`, `${v}px`));
  set('--radius-card', `${radius.card}px`);
  set('--radius-control', `${radius.control}px`);
  set('--radius-pill', `${radius.pill}px`);
  set('--motion-fast', `${motion.fastMs}ms`);
  set('--motion-base', `${motion.baseMs}ms`);
  set('--motion-slow', `${motion.slowMs}ms`);
  set('--ease-industrial', motion.industrial);
}

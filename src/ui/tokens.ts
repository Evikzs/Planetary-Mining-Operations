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

export const bodyAccent = {
  luna: '#9A9A94',
  mars: '#B5482A',
  europa: '#7FB9C2',
  titan: '#C98A2E',
} as const;

export const font = {
  display: '"Jost Variable", "Jost", sans-serif',
  text: '"IBM Plex Sans", sans-serif',
  mono: '"IBM Plex Mono", monospace',
} as const;

export const space = [0, 4, 8, 12, 16, 24, 32, 48] as const;
export const radius = { card: 2, pill: 999 } as const;
export const motion = {
  fastMs: 120,
  baseMs: 220,
  slowMs: 420,
  industrial: 'cubic-bezier(0.65, 0, 0.25, 1)',
} as const;

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

export function applyTokens(root: HTMLElement): void {
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  for (const [k, v] of Object.entries({ ...palette, ...bodyAccent })) set(`--c-${k}`, v);
  set('--font-display', font.display);
  set('--font-text', font.text);
  set('--font-mono', font.mono);
  space.forEach((v, i) => set(`--space-${i}`, `${v}px`));
  set('--radius-card', `${radius.card}px`);
  set('--motion-fast', `${motion.fastMs}ms`);
  set('--motion-base', `${motion.baseMs}ms`);
  set('--motion-slow', `${motion.slowMs}ms`);
  set('--ease-industrial', motion.industrial);
}

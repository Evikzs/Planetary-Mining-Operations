import type { JSX } from 'preact';

const PATHS = {
  build: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  people:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11.5a2.5 2.5 0 1 0 0-5M15.5 14.5c3 0 5.5 2.2 5.5 5.5',
  trade: 'M4 18l5-6 4 3 7-9M15 6h5v5',
  contracts: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  codex: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  alert: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  power: 'M13 2L4 14h7l-1 8 9-12h-7z',
  workforce: 'M3 17h18M5 17a7 7 0 0 1 14 0M12 5v4',
  reputation: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM9 13l-2 8 5-3 5 3-2-8',
  trendUp: 'M12 6l7 12H5z',
  trendDown: 'M12 18L5 6h14z',
  trendFlat: 'M4 12h16',
  close: 'M6 6l12 12M18 6L6 18',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 6l3 6-3 6-3-6z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

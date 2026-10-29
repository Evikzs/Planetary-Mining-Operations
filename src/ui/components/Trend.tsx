import { trendOf } from '../format';
import { Icon } from '../icons';

const TREND = {
  up: { icon: 'trendUp', label: 'price rising' },
  down: { icon: 'trendDown', label: 'price falling' },
  flat: { icon: 'trendFlat', label: 'price steady' },
} as const;

/** Where a price went over the last 24 hours, as an icon with a spoken label. */
export function Trend({ history }: { history: number[] }) {
  const trend = trendOf(history);
  return (
    <span class={`trend ${trend}`} role="img" aria-label={TREND[trend].label}>
      <Icon name={TREND[trend].icon} size={12} />
    </span>
  );
}

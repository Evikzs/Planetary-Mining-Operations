import { signal } from '@preact/signals';
import { ui, world } from '../../client/store';
import { BUILDINGS } from '../../data/buildings';
import { alertText, type AlertNames } from '../../data/copy';
import type { WorldView } from '../../sim/views';
import { formatGameDuration } from '../format';
import { Icon } from '../icons';

export const alertsOpen = signal(false);
/** Alerts stamped after this tick count as new. */
const seenTick = signal(-1);

function namesIn(w: WorldView | null): AlertNames {
  const building = (id: number): string | null => {
    const b = w?.buildings.find((x) => x.id === id);
    return b ? BUILDINGS[b.type].name : null;
  };
  return {
    building,
    belt: (id) => {
      const belt = w?.belts.find((x) => x.id === id);
      return belt ? building(belt.buildingId) : null;
    },
  };
}

export function toggleAlerts(): void {
  alertsOpen.value = !alertsOpen.value;
  seenTick.value = ui.value?.tick ?? seenTick.value;
}

export function AlertsBell() {
  const alerts = ui.value?.alerts ?? [];
  const unread = alerts.filter((a) => a.tick > seenTick.value).length;
  return (
    <button
      type="button"
      class="icon-button bell"
      aria-label={unread ? `Alerts, ${unread} new` : 'Alerts'}
      aria-expanded={alertsOpen.value}
      onClick={toggleAlerts}
    >
      <Icon name="alert" />
      {unread > 0 && (
        <span class="badge num" aria-hidden="true">
          {unread}
        </span>
      )}
    </button>
  );
}

/** The latest 20 alerts, newest first. */
export function AlertsList() {
  const snap = ui.value;
  if (!alertsOpen.value || !snap) return null;
  const names = namesIn(world.value);
  return (
    <section class="alerts card" data-testid="alerts" aria-label="Alerts">
      <header>
        <h2>Alerts</h2>
        <button type="button" class="icon-button" aria-label="Close alerts" onClick={toggleAlerts}>
          <Icon name="close" />
        </button>
      </header>
      {snap.alerts.length === 0 ? (
        <p class="body">Nothing needs you now.</p>
      ) : (
        <ol class="body">
          {snap.alerts.map((a, i) => (
            <li key={`${a.tick}-${i}`}>
              <p>{alertText(a, names)}</p>
              <span class="num when">
                {snap.tick > a.tick ? `${formatGameDuration(snap.tick - a.tick)} ago` : 'Just now'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

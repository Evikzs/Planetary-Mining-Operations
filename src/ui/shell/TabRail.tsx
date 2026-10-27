import { Icon } from '../icons';
import { activeTab, TABS, toggleTab } from './tabs';

export function TabRail() {
  return (
    <nav class="rail" data-testid="tab-rail" aria-label="Main">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={activeTab.value === tab.id}
          aria-keyshortcuts={tab.key}
          onClick={() => toggleTab(tab.id)}
        >
          <Icon name={tab.icon} />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

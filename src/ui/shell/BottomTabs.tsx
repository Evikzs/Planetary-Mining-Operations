import { signal } from '@preact/signals';
import { Icon } from '../icons';
import { activeTab, TABS, toggleTab, type TabId } from './tabs';

const MAIN: TabId[] = ['build', 'people', 'trade', 'contracts'];
export const moreOpen = signal(false);

export function BottomTabs() {
  const moreActive =
    moreOpen.value || activeTab.value === 'codex' || activeTab.value === 'settings';
  return (
    <nav class="bottom-tabs" data-testid="bottom-tabs" aria-label="Main">
      {TABS.filter((t) => MAIN.includes(t.id)).map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={activeTab.value === tab.id}
          onClick={() => {
            moreOpen.value = false;
            toggleTab(tab.id);
          }}
        >
          <Icon name={tab.icon} />
          {tab.label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={moreActive}
        onClick={() => {
          activeTab.value = null;
          moreOpen.value = !moreOpen.value;
        }}
      >
        <Icon name="more" />
        More
      </button>
    </nav>
  );
}

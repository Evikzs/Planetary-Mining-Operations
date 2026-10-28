import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { selection } from '../../client/store';
import type { DebugFlags } from '../../worker/protocol';
import { Icon } from '../icons';
import { BottomTabs, moreOpen } from './BottomTabs';
import { Compass } from './Compass';
import { ContextPanel } from './ContextPanel';
import { NewsTicker } from './NewsTicker';
import { MapCanvas } from './MapCanvas';
import { MapFilters } from './MapFilters';
import { Sheet } from './Sheet';
import { TabRail } from './TabRail';
import { activeTab, TABS, toggleTab, type TabId } from './tabs';
import { TopBar } from './TopBar';
import { isDesktop } from './useBreakpoint';

// Placeholder bodies; the tab tasks (34–38) replace them.
const TAB_BODY: Record<TabId, () => ComponentChildren> = {
  build: () => <p>Select a plot to see what you can build there.</p>,
  people: () => <p>Your workers show here once your company is founded.</p>,
  trade: () => <p>Lunar market prices show here.</p>,
  contracts: () => <p>Contract offers show here.</p>,
  codex: () => <p>Entries unlock as you meet new things.</p>,
  settings: () => <p>Game settings show here.</p>,
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const tab = TABS.find((t) => t.key === e.key);
      if (tab) toggleTab(tab.id);
      else if (e.key === 'Escape') {
        activeTab.value = null;
        moreOpen.value = false;
        selection.value = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function TabPanel({ desktop }: { desktop: boolean }) {
  const id = activeTab.value;
  const close = () => (activeTab.value = null);
  if (!desktop && moreOpen.value) {
    return (
      <Sheet title="More" onClose={() => (moreOpen.value = false)}>
        <div class="more-list">
          {TABS.filter((t) => t.id === 'codex' || t.id === 'settings').map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                moreOpen.value = false;
                activeTab.value = t.id;
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (!id) return null;
  const title = TABS.find((t) => t.id === id)?.label ?? '';
  if (!desktop) {
    return (
      <Sheet title={title} onClose={close}>
        {TAB_BODY[id]()}
      </Sheet>
    );
  }
  return (
    <section class="panel card" data-testid="tab-panel" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" class="icon-button" aria-label="Close panel" onClick={close}>
          <Icon name="close" />
        </button>
      </header>
      <div class="body">{TAB_BODY[id]()}</div>
    </section>
  );
}

export function Shell({ flags }: { flags: DebugFlags }) {
  useShortcuts();
  const desktop = isDesktop.value;
  return (
    <div class="shell" data-testid="app" data-layout={desktop ? 'desktop' : 'phone'}>
      <MapCanvas flags={flags} />
      <Compass />
      <MapFilters />
      <TopBar />
      {desktop ? <TabRail /> : <BottomTabs />}
      <TabPanel desktop={desktop} />
      <ContextPanel />
      {desktop && <NewsTicker />}
    </div>
  );
}

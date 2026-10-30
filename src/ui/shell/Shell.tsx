import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { companionOpen, selection, ui } from '../../client/store';
import type { DebugFlags } from '../../worker/protocol';
import { CompanionBubble } from '../companion/CompanionBubble';
import { Icon } from '../icons';
import { AwayScreen } from '../screens/AwayScreen';
import { CatchUpOverlay } from '../screens/CatchUpOverlay';
import { FoundingScreen } from '../screens/FoundingScreen';
import { BuildTab } from '../tabs/BuildTab';
import { CodexTab } from '../tabs/CodexTab';
import { ContractsTab } from '../tabs/ContractsTab';
import { PeopleTab } from '../tabs/PeopleTab';
import { SettingsTab } from '../tabs/SettingsTab';
import { TradeTab } from '../tabs/TradeTab';
import { AlertsList, alertsOpen } from './Alerts';
import { ErrorBanner } from './ErrorBanner';
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

const TAB_BODY: Record<TabId, () => ComponentChildren> = {
  build: () => <BuildTab />,
  people: () => <PeopleTab />,
  trade: () => <TradeTab />,
  contracts: () => <ContractsTab />,
  codex: () => <CodexTab />,
  settings: () => <SettingsTab />,
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
        alertsOpen.value = false;
        companionOpen.value = false;
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
  const snap = ui.value;
  // Until the company exists, the founding screen is all there is over the turning Moon.
  return (
    <div
      class="shell"
      data-testid="app"
      data-layout={desktop ? 'desktop' : 'phone'}
      data-panel={activeTab.value ? 'open' : 'closed'}
    >
      <MapCanvas flags={flags} />
      {snap?.company && (
        <>
          <Compass />
          <MapFilters />
          <TopBar />
          {desktop ? <TabRail /> : <BottomTabs />}
          <TabPanel desktop={desktop} />
          <ContextPanel />
          <AlertsList />
          <CompanionBubble desktop={desktop} />
          {desktop && <NewsTicker />}
        </>
      )}
      {snap && !snap.company && <FoundingScreen />}
      <AwayScreen />
      <CatchUpOverlay />
      <ErrorBanner />
    </div>
  );
}

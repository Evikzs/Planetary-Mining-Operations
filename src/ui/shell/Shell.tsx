import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { selection, ui, uiScale } from '../../client/store';
import type { DebugFlags } from '../../worker/protocol';
import { CompanionBubble } from '../companion/CompanionBubble';
import { Icon } from '../icons';
import { AwayScreen } from '../screens/AwayScreen';
import { CatchUpOverlay } from '../screens/CatchUpOverlay';
import { FoundingScreen } from '../screens/FoundingScreen';
import { BuildTab } from '../tabs/BuildTab';
import { CodexTab } from '../tabs/CodexTab';
import { ContractsTab } from '../tabs/ContractsTab';
import { FinanceTab } from '../tabs/FinanceTab';
import { PeopleTab } from '../tabs/PeopleTab';
import { SettingsTab } from '../tabs/SettingsTab';
import { TradeTab } from '../tabs/TradeTab';
import { AlertsList, alertsOpen } from './Alerts';
import { ErrorBanner } from './ErrorBanner';
import { Compass } from './Compass';
import { ContextPanel } from './ContextPanel';
import { NewsTicker } from './NewsTicker';
import { MapCanvas } from './MapCanvas';
import { MapFilters } from './MapFilters';
import { TabRail } from './TabRail';
import { activeTab, TABS, toggleTab, type TabId } from './tabs';
import { TopBar } from './TopBar';
import { Tooltip } from './Tooltip';
import { setClock, togglePause } from './ClockControls';
import type { Speed } from '../../worker/protocol';

const TAB_BODY: Record<TabId, () => ComponentChildren> = {
  build: () => <BuildTab />,
  people: () => <PeopleTab />,
  trade: () => <TradeTab />,
  finance: () => <FinanceTab />,
  contracts: () => <ContractsTab />,
  codex: () => <CodexTab />,
  settings: () => <SettingsTab />,
};

const SPEED_KEYS: Record<string, Speed> = { '1': 1, '2': 2, '3': 4, '4': 8 };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const tab = TABS.find((t) => t.key === e.key.toLowerCase());
      const speed = SPEED_KEYS[e.key];
      if (tab) toggleTab(tab.id);
      else if (e.code === 'Space') {
        // A focused button would also take Space as a click.
        e.preventDefault();
        togglePause();
      } else if (speed) setClock(false, speed);
      else if (e.key === 'Escape') {
        activeTab.value = null;
        alertsOpen.value = false;
        selection.value = null;
      }
    };
    // The browser's menu never opens over the game, except in fields, for copy and paste.
    const onMenu = (e: MouseEvent) => {
      if (!isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onMenu);
    };
  }, []);
}

function TabPanel() {
  const id = activeTab.value;
  const close = () => (activeTab.value = null);
  if (!id) return null;
  const title = TABS.find((t) => t.id === id)?.label ?? '';
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
  const snap = ui.value;
  // Until the company exists, the founding screen is all there is over the turning Moon.
  return (
    <div
      class="shell"
      data-testid="app"
      data-panel={activeTab.value ? 'open' : 'closed'}
      style={{ '--ui-scale': String(uiScale.value) }}
    >
      <MapCanvas flags={flags} />
      {/* The interface scales as one layer; the map keeps its pixels, so picks stay true. */}
      <div class="hud">
        {snap?.company && (
          <>
            <Compass />
            <MapFilters />
            <TopBar />
            <TabRail />
            <TabPanel />
            <ContextPanel />
            <AlertsList />
            <CompanionBubble />
            <NewsTicker />
          </>
        )}
        {snap && !snap.company && <FoundingScreen />}
        <AwayScreen />
        <CatchUpOverlay />
        <ErrorBanner />
      </div>
      <Tooltip />
    </div>
  );
}

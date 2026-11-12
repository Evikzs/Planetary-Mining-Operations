import '@fontsource-variable/jost';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './ui/global.css';
import { effect } from '@preact/signals';
import { render } from 'preact';
import { debugEnabled, parseDebugFlags } from './client/debugFlags';
import { loadMotionPref, loadOfflinePref, loadUiScale } from './client/preferences';
import { createSimClient, type SimClient } from './client/simClient';
import {
  away,
  catchUpProgress,
  clock,
  gameRenderer,
  motion,
  motionPref,
  recentFills,
  reducedMotion,
  simClient,
  systemReducedMotion,
  ui,
  uiScale,
  workerError,
  world,
} from './client/store';
import { installTestApi } from './client/testApi';
import { isWebGL2Available } from './render/webgl';
import type { SimEvent } from './sim/events';
import { App, APP_TITLE } from './ui/App';
import { OtherTab } from './ui/screens/OtherTab';
import { formatMoney } from './ui/format';
import { flyIncome } from './ui/motion/incomeTokens';
import { applyTokens } from './ui/tokens';
import { PLAYER } from './sim/companies';

const html = document.documentElement;
applyTokens(html);
// Reduced motion follows the device unless the player chose otherwise in Settings.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
systemReducedMotion.value = reduced.matches;
reduced.addEventListener('change', (e) => (systemReducedMotion.value = e.matches));
motionPref.value = loadMotionPref();
uiScale.value = loadUiScale(window.innerWidth);
effect(() => {
  html.dataset.motion = reducedMotion.value ? 'reduced' : 'full';
});

/** Starts the game worker and the interface; only the tab that holds the game lock does this. */
function start(root: HTMLElement): void {
  const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
  const client = createSimClient(worker);
  simClient.value = client;
  client.on('snapshot', (msg) => {
    ui.value = msg.ui;
    clock.value = msg.clock;
  });
  client.on('world', (msg) => (world.value = msg.world));
  client.on(
    'motion',
    (msg) =>
      (motion.value = { view: msg.motion, anchorRealMs: msg.anchorRealMs, clock: msg.clock }),
  );
  client.on('away', (msg) => (away.value = msg.summary));
  client.on('error', (msg) => (workerError.value = msg.message));
  worker.addEventListener('error', (e) => {
    workerError.value = `The game could not run: ${e.message || 'its script failed to load'}.`;
  });
  client.on('catchUp', (msg) => (catchUpProgress.value = msg.progress < 1 ? msg.progress : null));
  client.on('events', (msg) => {
    const fills = msg.events.filter((e) => e.t === 'trade').filter((e) => e.companyId === PLAYER);
    if (fills.length) recentFills.value = [...fills.reverse(), ...recentFills.value].slice(0, 10);
    flyIncomeTokens(msg.events);
  });
  if (debugEnabled()) installTestApi(client);
  const flags = parseDebugFlags(location.search, debugEnabled());
  const prefs = { offlineCatchUp: loadOfflinePref() };
  const desktop = connectDesktop(client);
  client.post({ t: 'init', nowMs: Date.now(), debug: flags, prefs, fileSaves: desktop });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') client.saveNow();
  });
  const webgl = !flags.noWebgl && isWebGL2Available();
  render(<App flags={flags} webgl={webgl} />, root);
}

/**
 * In the desktop app, the worker's save files go through the preload, and the window waits for a
 * last save before it closes. False in a browser.
 */
function connectDesktop(client: SimClient): boolean {
  const saves = window.pmoSaves;
  if (!saves) return false;
  client.on('storeCall', (msg) => {
    const run =
      msg.op === 'list'
        ? saves.list()
        : msg.op === 'read'
          ? saves.read(msg.slot ?? '')
          : saves.write(msg.slot ?? '', msg.text ?? '');
    run.then(
      (value) => client.post({ t: 'storeResult', id: msg.id, ok: true, value }),
      (err: unknown) =>
        client.post({ t: 'storeResult', id: msg.id, ok: false, error: String(err) }),
    );
  });
  let closeId = 0;
  window.pmoApp?.onCloseRequest(() => {
    const id = ++closeId;
    client.on('saved', (msg) => {
      if (msg.id === id) window.pmoApp?.closeReady();
    });
    client.post({ t: 'saveNow', id });
  });
  return true;
}

/** Income flies from where it was made to the cash readout: one token per plot per batch. */
function flyIncomeTokens(events: SimEvent[]): void {
  if (html.dataset.motion === 'reduced') return;
  const byPlot = new Map<number, number>();
  for (const e of events) {
    if (e.t === 'income' && e.plotId !== null && e.companyId === PLAYER) {
      byPlot.set(e.plotId, (byPlot.get(e.plotId) ?? 0) + e.cents);
    }
  }
  if (byPlot.size === 0) return;
  const cash = document.querySelector('[data-testid="cash"]')?.getBoundingClientRect();
  if (!cash) return;
  const to = { x: cash.left + cash.width / 2, y: cash.top + cash.height / 2 };
  for (const [plotId, cents] of byPlot) {
    const plot = world.value?.plots.find((p) => p.id === plotId);
    const from = plot && gameRenderer.value?.project(plot.dir, 0.2);
    const onScreen =
      from && from.x >= 0 && from.y >= 0 && from.x <= innerWidth && from.y <= innerHeight;
    if (onScreen) flyIncome(from, to, `+${formatMoney(cents)}`);
  }
}

// One tab plays at a time: two would each run the clock and save over each other.
const root = document.getElementById('app');
if (root && 'locks' in navigator) {
  void navigator.locks.request('pmo-game', { ifAvailable: true }, (lock) => {
    if (!lock) {
      render(<OtherTab title={APP_TITLE} />, root);
      return;
    }
    start(root);
    return new Promise<never>(() => undefined); // held while the page lives
  });
} else if (root) {
  start(root);
}

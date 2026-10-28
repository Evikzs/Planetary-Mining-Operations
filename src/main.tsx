import '@fontsource-variable/jost';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './ui/global.css';
import { render } from 'preact';
import { debugEnabled, parseDebugFlags } from './client/debugFlags';
import { createSimClient } from './client/simClient';
import { away, catchUpProgress, gameRenderer, motion, simClient, ui, world } from './client/store';
import { installTestApi } from './client/testApi';
import { isWebGL2Available } from './render/webgl';
import type { SimEvent } from './sim/events';
import { App } from './ui/App';
import { formatMoney } from './ui/format';
import { flyIncome } from './ui/motion/incomeTokens';
import { applyTokens } from './ui/tokens';

const html = document.documentElement;
applyTokens(html);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const syncMotion = () => (html.dataset.motion = reduced.matches ? 'reduced' : 'full');
syncMotion();
reduced.addEventListener('change', syncMotion);

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const client = createSimClient(worker);
simClient.value = client;
client.on('snapshot', (msg) => (ui.value = msg.ui));
client.on('world', (msg) => (world.value = msg.world));
client.on('motion', (msg) => (motion.value = { view: msg.motion, anchorRealMs: msg.anchorRealMs }));
client.on('away', (msg) => (away.value = msg.summary));
client.on('catchUp', (msg) => (catchUpProgress.value = msg.progress < 1 ? msg.progress : null));
client.on('events', (msg) => flyIncomeTokens(msg.events));
if (debugEnabled()) installTestApi(client);
const flags = parseDebugFlags(location.search, debugEnabled());
client.post({ t: 'init', nowMs: Date.now(), debug: flags });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') client.saveNow();
});

/** Income flies from where it was made to the cash readout: one token per plot per batch. */
function flyIncomeTokens(events: SimEvent[]): void {
  if (html.dataset.motion === 'reduced') return;
  const byPlot = new Map<number, number>();
  for (const e of events) {
    if (e.t === 'income' && e.plotId !== null) {
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

const root = document.getElementById('app');
const webgl = !flags.noWebgl && isWebGL2Available();
if (root) render(<App flags={flags} webgl={webgl} />, root);

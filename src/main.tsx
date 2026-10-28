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
import { away, catchUpProgress, motion, ui, world } from './client/store';
import { installTestApi } from './client/testApi';
import { App } from './ui/App';
import { applyTokens } from './ui/tokens';

const html = document.documentElement;
applyTokens(html);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const syncMotion = () => (html.dataset.motion = reduced.matches ? 'reduced' : 'full');
syncMotion();
reduced.addEventListener('change', syncMotion);

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const client = createSimClient(worker);
client.on('snapshot', (msg) => (ui.value = msg.ui));
client.on('world', (msg) => (world.value = msg.world));
client.on('motion', (msg) => (motion.value = { view: msg.motion, anchorRealMs: msg.anchorRealMs }));
client.on('away', (msg) => (away.value = msg.summary));
client.on('catchUp', (msg) => (catchUpProgress.value = msg.progress < 1 ? msg.progress : null));
if (debugEnabled()) installTestApi(client);
client.post({
  t: 'init',
  nowMs: Date.now(),
  debug: parseDebugFlags(location.search, debugEnabled()),
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') client.saveNow();
});

const root = document.getElementById('app');
if (root) render(<App />, root);

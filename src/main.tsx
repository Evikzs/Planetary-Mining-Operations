import { render } from 'preact';
import { debugEnabled, parseDebugFlags } from './client/debugFlags';
import { createSimClient } from './client/simClient';
import { ui } from './client/store';
import { App } from './ui/App';

const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const client = createSimClient(worker);
client.on('snapshot', (msg) => (ui.value = msg.ui));
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

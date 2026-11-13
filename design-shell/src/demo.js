// Stand-in for the game: starts the shell and feeds the HUD with numbers that move.
// Replace this file with the real plumbing. Nothing else imports it.
import { createShell } from './shell.js';

const game = document.getElementById('game');
let shell;
try { shell = createShell(game); } catch (e) {
  // No WebGL (old device, or hardware acceleration is off): say so, do not leave a black page.
  game.textContent = 'This view needs WebGL. Turn on hardware acceleration in your browser, then load the page again.';
  game.style.cssText = 'display:grid;place-items:center;height:100%;padding:24px;box-sizing:border-box;color:#ece6da;font:16px system-ui,sans-serif;text-align:center';
  throw e;
}
window.shell = shell; // for the console

const stock = { ore: 12480, gem: 318, power: 4.2, water: 71, people: 2910 };
const fmt = (n) => Math.round(n).toLocaleString('en');
function ledger() {
  shell.hud.setLedger([
    { id: 'ore', label: 'Ore', value: fmt(stock.ore), unit: 't', rate: '+86 each hour' },
    { id: 'gem', label: 'Rhodonite', value: fmt(stock.gem), unit: 'kg', rate: '+2.1 each hour', gem: true },
    { id: 'power', label: 'Power', value: stock.power.toFixed(1), unit: 'MW', rate: '−0.3 at night' },
    { id: 'water', label: 'Water', value: fmt(stock.water), unit: '%', rate: null },
    { id: 'people', label: 'People', value: fmt(stock.people), unit: '', rate: '+4 this cycle' },
  ]);
}
ledger();

const NEWS = [
  ['Belt two is back at full rate.'], ['The lifter is loaded. It goes up at dusk.'], ['New rose seam open on bench three.', 'find'],
  ['Loop bus 2 is in the shop until morning.'], ['Dome four reports a good crop.'], ['Night shift starts at the mine gate.'],
  ['Assay office: grade 62 on the last load.', 'find'], ['Wind is up. Dust at the rim road.'],
];
let n = 0;
shell.hud.log('Day shift is on. All belts run.');
setInterval(() => {
  const { paused, speed } = shell.state;
  if (paused) return;
  stock.ore += 0.6 * speed; stock.gem += 0.015 * speed;
  ledger();
}, 1000);
setInterval(() => { if (!shell.state.paused) shell.hud.log(...NEWS[n++ % NEWS.length]); }, 9000);

import { START_BUILDINGS, START_CASH_CENTS, START_STOCK_T } from '../../data/balance';
import type { GoodId } from '../../data/goods';
import { angleBetween } from '../../shared/vec3';
import { add } from '../inventory';
import { transfer } from '../ledger';
import { newId, type GameState } from '../state';
import { worldOf } from '../world/luna';
import { connectToNetwork } from '../world/roads';
import { addBuilding, gridFor, hubDir, ownSection } from './sections';

/** The founding charter: one south-polar section, starter buildings, cash and stock. */
export function grantCharter(state: GameState): void {
  const world = worldOf(state);
  const sid = world.foundingSectionId;
  const section = ownSection(state, sid);
  const hub = hubDir(state, sid);
  const grid = gridFor(state, sid);
  const plots = world.plots
    .filter((p) => p.sectionId === sid && p.kind === 'build')
    .sort((a, b) => angleBetween(a.dir, hub) - angleBetween(b.dir, hub));
  let next = 0;
  for (const type of START_BUILDINGS) {
    while (next < plots.length) {
      const plot = plots[next++]!;
      if (connectToNetwork(grid, section.roadNet!, plot.dir, () => newId(state))) {
        addBuilding(state, plot, type, 'active');
        break;
      }
    }
  }
  transfer(state.ledger, 'world', 'player', START_CASH_CENTS);
  for (const [g, t] of Object.entries(START_STOCK_T)) {
    add(section.depot, g as GoodId, Math.round(t * 1000));
  }
}

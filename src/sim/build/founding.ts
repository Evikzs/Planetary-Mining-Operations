import {
  START_BUILDINGS,
  START_CASH_CENTS,
  START_STOCK_T,
  START_WORKERS,
} from '../../data/balance';
import { SKILLS } from '../../data/buildings';
import { seatCurrentShift } from '../people/commute';
import { autoAssign } from '../people/jobs';
import { addWorker, SKILL_CODE } from '../people/store';
import { createRng, deriveSeed } from '../rng';
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
  const quarters = state.buildings.find((b) => b.type === 'crewQuarters');
  const names = createRng(deriveSeed(state.seed, 'founders'));
  for (const skill of SKILLS) {
    for (let i = 0; i < START_WORKERS[skill]; i++) {
      addWorker(state.people, {
        first: names.int(0, 159),
        last: names.int(0, 159),
        skill: SKILL_CODE[skill],
        level: 1,
        home: quarters?.id ?? -1,
        morale: 75,
      });
    }
  }
  // The night shift is already at work when the charter is granted at 05:00.
  autoAssign(state);
  seatCurrentShift(state);
}

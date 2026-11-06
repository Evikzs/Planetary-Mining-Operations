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
import { newId, type GameState } from '../state';
import { worldOf } from '../world/luna';
import { connectToNetwork } from '../world/roads';
import { addBuilding, gridFor, hubDir, ownSection } from './sections';
import { companyOf, PLAYER, type CompanyId } from '../companies';
import { baseValueCents, cashIn, listCostCents, receiveGoods } from '../finance/books';

/** A founding charter: one section with starter buildings, cash, stock and workers. */
export function grantCharter(state: GameState, companyId: CompanyId, sid: number): void {
  const world = worldOf(state);
  const section = ownSection(state, sid, companyId);
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
  // The founders put in the cash, the stock and the starter buildings: all share capital.
  cashIn(
    state,
    companyId,
    START_CASH_CENTS,
    { to: 'equity', account: 'shareCapital' },
    'financing',
  );
  let contributed = 0;
  for (const [g, t] of Object.entries(START_STOCK_T)) {
    const kg = Math.round(t * 1000);
    add(section.depot, g as GoodId, kg);
    receiveGoods(state, companyId, g as GoodId, kg, baseValueCents(g as GoodId, kg));
    contributed += baseValueCents(g as GoodId, kg);
  }
  for (const b of state.buildings) {
    if (b.sectionId !== sid) continue;
    b.costCents = listCostCents(b);
    b.bookCents = b.costCents;
    contributed += b.costCents;
  }
  companyOf(state, companyId)!.books.shareCapitalCents += contributed;
  const quarters = state.buildings.find((b) => b.type === 'crewQuarters' && b.sectionId === sid);
  // The player keeps the M1 stream, so existing seeds keep their founders' names.
  const stream = companyId === PLAYER ? 'founders' : `founders:${companyId}`;
  const names = createRng(deriveSeed(state.seed, stream));
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
  seatCurrentShift(state, sid);
}

import { grantCharter } from '../../src/sim/build/founding';
import { makeCompany, type CompanyId, type CompanyState } from '../../src/sim/companies';
import type { GameState } from '../../src/sim/state';

/** Another company for tests, founded on `sectionId` with the player's endowment. */
export function addTestCompany(state: GameState, id: CompanyId, sectionId: number): CompanyState {
  const company = makeCompany(state, id, `Test Company ${id}`, 'rival', sectionId);
  state.companies.push(company);
  grantCharter(state, id, sectionId);
  return company;
}

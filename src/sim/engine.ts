import { beltsSystem } from './build/belts';
import {
  build,
  constructionSystem,
  demolish,
  setPriority,
  setRecipe,
  upgrade,
} from './build/construction';
import { grantCharter } from './build/founding';
import { buySection } from './build/landOffice';
import { powerSystem } from './build/power';
import { productionSystem } from './build/production';
import { shiftStartingAt } from './clock';
import { commuteSystem } from './people/commute';
import { assignWorker, jobsSystem } from './people/jobs';
import { migrationSystem } from './people/migration';
import { moraleSystem } from './people/morale';
import { needsSystem } from './people/needs';
import { payrollSystem } from './people/payroll';
import { fail, isValidCompanyName, OK, type Command, type CommandResult } from './commands';
import type { SimEvent } from './events';
import { rngFromState, type Rng } from './rng';
import { createInitialState, type GameState } from './state';

export type StepMode = 'fine' | 'coarse';

export interface StepContext {
  dtMinutes: number;
  mode: StepMode;
  offlineEfficiency: number;
  events: SimEvent[];
  rng: Rng;
}

export interface System {
  id: string;
  step(state: GameState, ctx: StepContext): void;
}

/** Advances the clock first, so later systems see the new tick. */
const clockSystem: System = {
  id: 'clock',
  step(state, ctx) {
    for (let t = state.tick + 1; t <= state.tick + ctx.dtMinutes; t++) {
      const shift = shiftStartingAt(t);
      if (shift !== null) ctx.events.push({ t: 'shiftChange', shift });
    }
    state.tick += ctx.dtMinutes;
  },
};

export const SYSTEMS: System[] = [
  clockSystem,
  constructionSystem,
  // Crews first: power and production must see the same workers at work.
  jobsSystem,
  commuteSystem,
  powerSystem,
  needsSystem,
  moraleSystem,
  migrationSystem,
  payrollSystem,
  beltsSystem,
  productionSystem,
];

export function createGame(seed: number): GameState {
  return createInitialState(seed);
}

export function applyCommand(state: GameState, cmd: Command): CommandResult {
  switch (cmd.t) {
    case 'foundCompany': {
      if (state.company) return fail('ALREADY_FOUNDED');
      if (!isValidCompanyName(cmd.name)) return fail('INVALID_NAME');
      if (cmd.companionId !== 'veteran') return fail('COMPANION_UNAVAILABLE');
      state.company = { name: cmd.name.trim(), companionId: cmd.companionId };
      grantCharter(state);
      state.pendingEvents.push({ t: 'founded' });
      return OK;
    }
    case 'build':
      return build(state, cmd);
    case 'upgrade':
      return upgrade(state, cmd.buildingId);
    case 'demolish':
      return demolish(state, cmd.buildingId);
    case 'setRecipe':
      return setRecipe(state, cmd.buildingId, cmd.recipeId);
    case 'setPriority':
      return setPriority(state, cmd.buildingId, cmd.priority);
    case 'buySection':
      return buySection(state, cmd.sectionId);
    case 'assignWorker':
      return assignWorker(state, cmd);
    case 'setWageLevel':
      if (!state.company) return fail('NOT_FOUNDED');
      state.wageLevel[cmd.skill] = cmd.level;
      return OK;
  }
}

export function step(
  state: GameState,
  opts: { mode: StepMode; offlineEfficiency?: number },
): SimEvent[] {
  const dtMinutes = opts.mode === 'fine' ? 1 : 60;
  if (opts.mode === 'coarse' && state.tick % 60 !== 0) {
    throw new Error('coarse step must start on the hour');
  }
  const rng = rngFromState(state.rng);
  const ctx: StepContext = {
    dtMinutes,
    mode: opts.mode,
    offlineEfficiency: opts.offlineEfficiency ?? 1,
    events: state.pendingEvents.splice(0),
    rng,
  };
  for (const system of SYSTEMS) system.step(state, ctx);
  state.rng = rng.getState();
  return ctx.events;
}

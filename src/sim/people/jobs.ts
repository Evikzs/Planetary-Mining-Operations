import type { Building, GameState } from '../state';

/** Share of a building's job slots filled by present workers, 0..1. Task 18 replaces this stub. */
export function staffing(state: GameState, building: Building): number {
  void state;
  void building;
  return 1;
}

/** Morale × commute productivity of a building's workers. Tasks 17 and 18 replace this stub. */
export function workforceProductivity(state: GameState, building: Building): number {
  void state;
  void building;
  return 1;
}

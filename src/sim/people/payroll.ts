import { WAGE_CENTS_PER_DAY, WAGE_LEVEL } from '../../data/balance';
import type { System } from '../engine';
import { balance, transfer } from '../ledger';
import type { GameState } from '../state';
import { SKILL_OF } from './store';
import { cashAccount, PLAYER, playerCompany } from '../companies';

/** What one game hour of wages costs at the current head count and wage levels. */
export function payrollCentsPerHour(state: GameState): number {
  const company = playerCompany(state);
  if (!company) return 0;
  const p = state.people;
  let total = 0;
  for (let i = 0; i < p.count; i++) {
    const skill = SKILL_OF[p.skill[i]!]!;
    total += Math.round(
      (WAGE_CENTS_PER_DAY[skill] * WAGE_LEVEL[company.wageLevel[skill]].factor) / 24,
    );
  }
  return total;
}

export const payrollSystem: System = {
  id: 'payroll',
  step(state) {
    if (state.tick % 60 !== 0) return;
    const company = playerCompany(state);
    if (!company) return;
    const due = payrollCentsPerHour(state);
    const cash = balance(state.ledger, cashAccount(PLAYER));
    transfer(state.ledger, cashAccount(PLAYER), 'world', Math.min(due, cash));
    company.payrollShortfall = cash < due;
  },
};

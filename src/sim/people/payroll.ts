import { WAGE_CENTS_PER_DAY, WAGE_LEVEL } from '../../data/balance';
import { cashAccount, ownersByBuilding, PLAYER, type CompanyId } from '../companies';
import type { System } from '../engine';
import { balance } from '../ledger';
import { cashOut } from '../finance/books';
import type { GameState } from '../state';
import { SKILL_OF } from './store';
import { payDue } from '../finance/credit';

/** What one game hour of wages costs each company, at its head count and wage levels. */
export function payrollByCompany(state: GameState): Map<CompanyId, number> {
  const p = state.people;
  const owners = ownersByBuilding(state);
  const levels = new Map(state.companies.map((c) => [c.id, c.wageLevel]));
  const due = new Map<CompanyId, number>();
  for (let i = 0; i < p.count; i++) {
    const co = owners.get(p.home[i]!);
    const level = co === undefined ? undefined : levels.get(co);
    if (co === undefined || !level) continue;
    const skill = SKILL_OF[p.skill[i]!]!;
    const cents = Math.round((WAGE_CENTS_PER_DAY[skill] * WAGE_LEVEL[level[skill]].factor) / 24);
    due.set(co, (due.get(co) ?? 0) + cents);
  }
  return due;
}

/** What one game hour of wages costs a company at its current head count and wage levels. */
export const payrollCentsPerHour = (state: GameState, co: CompanyId = PLAYER): number =>
  payrollByCompany(state).get(co) ?? 0;

export const payrollSystem: System = {
  id: 'payroll',
  step(state) {
    if (state.tick % 60 !== 0) return;
    const due = payrollByCompany(state);
    for (const company of state.companies) {
      if (company.status !== 'active') continue;
      const cents = due.get(company.id) ?? 0;
      const cash = balance(state.ledger, cashAccount(company.id));
      const wages = { to: 'expense', line: 'wages' } as const;
      // Wages draw on the credit line before any worker goes unpaid.
      if (payDue(state, company.id, cents, wages, 'operating')) {
        company.payrollShortfall = false;
        continue;
      }
      cashOut(state, company.id, Math.min(cents, cash), wages, 'operating');
      company.payrollShortfall = cash < cents;
    }
  },
};

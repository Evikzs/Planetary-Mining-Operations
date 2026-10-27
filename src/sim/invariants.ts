import type { GameState } from './state';

/** Debug checks run after every tick in dev builds. Later tasks add inventories, people, orders. */
export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  let sum = 0;
  for (const [id, cents] of Object.entries(state.ledger.balances)) {
    if (!Number.isSafeInteger(cents))
      problems.push(`${id} balance is not a safe integer: ${cents}`);
    if (id !== 'world' && cents < 0) problems.push(`${id} balance is negative: ${cents}`);
    sum += cents;
  }
  if (sum !== 0) problems.push(`ledger does not balance: sum ${sum}`);
  return problems;
}

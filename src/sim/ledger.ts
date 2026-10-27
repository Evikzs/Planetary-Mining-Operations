export type AccountId = 'player' | 'world' | `escrow:${number}`;

/** Integer cents per account. The world account may go negative; the sum is always 0. */
export interface Ledger {
  balances: Record<string, number>;
}

export function createLedger(): Ledger {
  return { balances: {} };
}

export function balance(l: Ledger, id: AccountId): number {
  return l.balances[id] ?? 0;
}

export function transfer(l: Ledger, from: AccountId, to: AccountId, cents: number): boolean {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error(`invalid transfer amount: ${cents}`);
  }
  if (from !== 'world' && balance(l, from) < cents) return false;
  l.balances[from] = balance(l, from) - cents;
  l.balances[to] = balance(l, to) + cents;
  return true;
}

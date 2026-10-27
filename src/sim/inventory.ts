import type { GoodId } from '../data/goods';

/** Integer kilograms per good. */
export type Inventory = Partial<Record<GoodId, number>>;

function assertKg(kg: number): void {
  if (!Number.isSafeInteger(kg) || kg < 0) throw new Error(`invalid kg amount: ${kg}`);
}

export function add(inv: Inventory, g: GoodId, kg: number): void {
  assertKg(kg);
  if (kg > 0) inv[g] = (inv[g] ?? 0) + kg;
}

/** Removes exactly kg, or nothing when short. */
export function take(inv: Inventory, g: GoodId, kg: number): boolean {
  assertKg(kg);
  const have = inv[g] ?? 0;
  if (have < kg) return false;
  if (have === kg) delete inv[g];
  else inv[g] = have - kg;
  return true;
}

export function totalKg(inv: Inventory): number {
  let sum = 0;
  for (const v of Object.values(inv)) sum += v;
  return sum;
}

/** Moves up to kg; returns the amount moved. */
export function moveKg(from: Inventory, to: Inventory, g: GoodId, kg: number): number {
  assertKg(kg);
  const moved = Math.min(kg, from[g] ?? 0);
  if (moved > 0) {
    take(from, g, moved);
    add(to, g, moved);
  }
  return moved;
}

import type { GoodId } from '../../data/goods';
import { sectionState, storageCapKg } from '../build/sections';
import { fail, OK, type Command, type CommandResult } from '../commands';
import { add, take, totalKg } from '../inventory';
import { balance, transfer } from '../ledger';
import { newId, type GameState } from '../state';

export interface GoodMarket {
  goodId: GoodId;
  /** Centre of the NPC curves, in cents per tonne. */
  pRefCents: number;
  /** Last clearing price. */
  lastCents: number;
  /** Hourly clearing prices, oldest first, at most 168. */
  history: number[];
  volume24hKg: number;
}

export interface Order {
  id: number;
  goodId: GoodId;
  side: 'buy' | 'sell';
  kind: 'market' | 'limit' | 'standing';
  /** In total, or per day for a standing order. */
  qtyKg: number;
  /** Traded so far; today, for a standing order. */
  filledKg: number;
  limitCents: number | null;
  sectionId: number;
  dailyQtyKg: number | null;
  /** Goods a sell order holds back from the depot. */
  escrowKg: number;
  /** Cash a buy order holds back, in ledger account escrow:<id>. */
  escrowCents: number;
}

/** Cash a buy order holds: its limit, or 5 × pRef for a market order. */
export function buyEscrowCents(
  state: GameState,
  o: Pick<Order, 'goodId' | 'kind' | 'limitCents' | 'qtyKg'>,
): number {
  const price = o.limitCents ?? 5 * state.market[o.goodId].pRefCents;
  return Math.ceil((price * o.qtyKg) / 1000);
}

export function placeOrder(
  state: GameState,
  cmd: Extract<Command, { t: 'placeOrder' }>,
): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const section = sectionState(state, cmd.sectionId);
  if (!section) return fail('NOT_OWNED');
  const limit = cmd.kind === 'market' ? null : (cmd.limitCents ?? null);
  if (!Number.isSafeInteger(cmd.qtyKg) || cmd.qtyKg <= 0) return fail('INVALID_ORDER');
  if (cmd.kind !== 'market' && !(limit !== null && Number.isSafeInteger(limit) && limit > 0)) {
    return fail('INVALID_ORDER');
  }
  const draft = { goodId: cmd.goodId, kind: cmd.kind, limitCents: limit, qtyKg: cmd.qtyKg };
  const cents = cmd.side === 'buy' ? buyEscrowCents(state, draft) : 0;
  if (cmd.side === 'sell' && (section.depot[cmd.goodId] ?? 0) < cmd.qtyKg) {
    return fail('INSUFFICIENT_STOCK');
  }
  if (cmd.side === 'buy') {
    if (storageCapKg(state, cmd.sectionId) - totalKg(section.depot) < cmd.qtyKg) {
      return fail('STORAGE_FULL');
    }
    if (balance(state.ledger, 'player') < cents) return fail('INSUFFICIENT_CASH');
  }
  const order: Order = {
    ...draft,
    id: newId(state),
    side: cmd.side,
    filledKg: 0,
    sectionId: cmd.sectionId,
    dailyQtyKg: cmd.kind === 'standing' ? cmd.qtyKg : null,
    escrowKg: cmd.side === 'sell' ? cmd.qtyKg : 0,
    escrowCents: cents,
  };
  if (cmd.side === 'sell') take(section.depot, cmd.goodId, cmd.qtyKg);
  else transfer(state.ledger, 'player', `escrow:${order.id}`, cents);
  state.orders.push(order);
  return OK;
}

/** Returns what an order still holds to the player and drops it from the book. */
export function closeOrder(state: GameState, order: Order): void {
  const depot = sectionState(state, order.sectionId)?.depot;
  if (depot && order.escrowKg > 0) add(depot, order.goodId, order.escrowKg);
  const account = `escrow:${order.id}` as const;
  transfer(state.ledger, account, 'player', balance(state.ledger, account));
  delete state.ledger.balances[account];
  state.orders = state.orders.filter((o) => o !== order);
}

export function cancelOrder(state: GameState, orderId: number): CommandResult {
  if (!state.company) return fail('NOT_FOUNDED');
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return fail('UNKNOWN_ID');
  closeOrder(state, order);
  return OK;
}

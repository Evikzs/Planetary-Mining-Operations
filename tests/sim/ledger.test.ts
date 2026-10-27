import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/engine';
import { add, moveKg, take, totalKg, type Inventory } from '../../src/sim/inventory';
import { checkInvariants } from '../../src/sim/invariants';
import { balance, createLedger, transfer, type AccountId } from '../../src/sim/ledger';

const ACCOUNTS: AccountId[] = ['player', 'world', 'escrow:1', 'escrow:2'];
const sum = (l: ReturnType<typeof createLedger>) =>
  Object.values(l.balances).reduce((a, b) => a + b, 0);

describe('ledger', () => {
  it('conserves money across random transfers (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom(...ACCOUNTS),
            fc.constantFrom(...ACCOUNTS),
            fc.integer({ min: 0, max: 1_000_000 }),
          ),
          { maxLength: 200 },
        ),
        (ops) => {
          const l = createLedger();
          for (const [from, to, cents] of ops) transfer(l, from, to, cents);
          expect(sum(l)).toBe(0);
          for (const id of ACCOUNTS)
            if (id !== 'world') expect(balance(l, id)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('refuses overdraft except for world', () => {
    const l = createLedger();
    expect(transfer(l, 'player', 'world', 1)).toBe(false);
    expect(balance(l, 'player')).toBe(0);
    expect(transfer(l, 'world', 'player', 500)).toBe(true);
    expect(balance(l, 'world')).toBe(-500);
    expect(transfer(l, 'player', 'escrow:3', 500)).toBe(true);
    expect(balance(l, 'escrow:3')).toBe(500);
  });

  it('rejects fractional, negative and unsafe cents', () => {
    const l = createLedger();
    expect(() => transfer(l, 'world', 'player', 1.5)).toThrow();
    expect(() => transfer(l, 'world', 'player', -1)).toThrow();
    expect(() => transfer(l, 'world', 'player', Number.NaN)).toThrow();
    expect(() => transfer(l, 'world', 'player', 2 ** 60)).toThrow();
  });
});

describe('inventory', () => {
  it('never makes stock negative (fast-check take/add/move)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.constantFrom('add', 'take', 'move'),
            fc.constantFrom('ilmenite', 'steel'),
            fc.integer({ min: 0, max: 5000 }),
          ),
          { maxLength: 200 },
        ),
        (ops) => {
          const a: Inventory = {};
          const b: Inventory = {};
          let total = 0;
          for (const [op, g, kg] of ops) {
            if (op === 'add') {
              add(a, g, kg);
              total += kg;
            } else if (op === 'take') {
              const before = a[g] ?? 0;
              const ok = take(a, g, kg);
              if (ok) total -= kg;
              else expect(a[g] ?? 0).toBe(before);
            } else moveKg(a, b, g, kg);
            for (const inv of [a, b])
              for (const v of Object.values(inv)) expect(v).toBeGreaterThanOrEqual(0);
            expect(totalKg(a) + totalKg(b)).toBe(total);
          }
        },
      ),
    );
  });

  it('rejects fractional and negative kg', () => {
    expect(() => add({}, 'steel', 0.5)).toThrow();
    expect(() => add({}, 'steel', -1)).toThrow();
  });

  it('moveKg moves at most what is there', () => {
    const a: Inventory = { steel: 300 };
    const b: Inventory = {};
    expect(moveKg(a, b, 'steel', 1000)).toBe(300);
    expect(a.steel ?? 0).toBe(0);
    expect(b.steel).toBe(300);
  });
});

describe('invariants', () => {
  it('a fresh game has none and a broken ledger is reported', () => {
    const s = createGame(1);
    expect(checkInvariants(s)).toEqual([]);
    s.ledger.balances.player = -5;
    expect(checkInvariants(s).join('\n')).toContain('player');
  });
});

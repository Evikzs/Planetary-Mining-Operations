import { describe, expect, it } from 'vitest';
import { AUCTION } from '../../../src/data/auctions';
import { ARCHETYPES } from '../../../src/data/companies';
import { openLot } from '../../../src/sim/auctions';
import type { Command } from '../../../src/sim/commands';
import { cashAccount, PLAYER, type CompanyId } from '../../../src/sim/companies';
import { applyCommand, createGame, step, SYSTEMS } from '../../../src/sim/engine';
import { cashOut } from '../../../src/sim/finance/books';
import { listingOf } from '../../../src/sim/finance/shares';
import { balanceSheet, closeMonth } from '../../../src/sim/finance/statements';
import { balance } from '../../../src/sim/ledger';
import { createRivalsSystem } from '../../../src/sim/rivals/ai';
import { headroomCents, sectionValueCents } from '../../../src/sim/rivals/valuation';
import { payrollCentsPerHour } from '../../../src/sim/people/payroll';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}
function hours(s: GameState, n: number): void {
  for (let h = 0; h < n; h++) step(s, { mode: 'coarse' });
}

interface Sent {
  actor: CompanyId;
  cmd: Command;
  /** The sender's headroom just before the command. */
  headroom: number;
  /** Ceilings of the sender's proxies on other open lots. */
  committed: number;
}

/** Runs `n` game hours with a rivals system that records what each rival sends. */
function recording(s: GameState, n: number, eachHour: () => void = () => {}): Sent[] {
  const sent: Sent[] = [];
  const i = SYSTEMS.findIndex((x) => x.id === 'rivals');
  const original = SYSTEMS[i]!;
  SYSTEMS[i] = createRivalsSystem((state, cmd, actor) => {
    let committed = 0;
    for (const a of state.auctions) {
      if (a.status !== 'open' || (cmd.t === 'setProxy' && a.id === cmd.auctionId)) continue;
      committed += a.proxies.find((p) => p.companyId === actor)?.ceilingCents ?? 0;
    }
    sent.push({
      actor,
      cmd: structuredClone(cmd),
      headroom: headroomCents(state, actor),
      committed,
    });
    return applyCommand(state, cmd, actor);
  });
  try {
    for (let h = 0; h < n; h++) {
      step(s, { mode: 'coarse' });
      eachHour();
    }
  } finally {
    SYSTEMS[i] = original;
  }
  return sent;
}

/** The most valuable unowned neighbour of a company's charter. */
function neighbourOf(s: GameState, co: CompanyId): number {
  const owned = new Set(s.sections.map((x) => x.id));
  const charter = s.companies.find((c) => c.id === co)!.charterSectionId;
  return worldOf(s)
    .sections[charter]!.neighbors.filter((n) => !owned.has(n))
    .sort((a, b) => sectionValueCents(s, b, 10) - sectionValueCents(s, a, 10) || a - b)[0]!;
}

/** Takes a company's cash as a cost, leaving `left` cents. */
function drain(s: GameState, co: CompanyId, left: number): void {
  const cash = balance(s.ledger, cashAccount(co));
  expect(cashOut(s, co, cash - left, { to: 'expense', line: 'other' }, 'operating')).toBe(true);
}

const debtToEquity = (s: GameState, co: CompanyId) => {
  const b = balanceSheet(s, co);
  return (b.loans + b.credit) / b.equity;
};

describe('rival AI: finance and auctions', () => {
  it('a rival puts a proxy on a lot it values and wins it unopposed', () => {
    const s = founded();
    const sid = neighbourOf(s, 1);
    const a = openLot(s, { kind: 'section', sectionId: sid }, null, AUCTION.reserveCents, []);
    hours(s, 1);
    expect(a.proxies.some((p) => p.companyId !== PLAYER)).toBe(true);
    hours(s, 5);
    expect(a.status).toBe('won');
    expect(a.winner).not.toBe(PLAYER);
    expect(s.sections.find((x) => x.id === sid)!.owner).toBe(a.winner);
  });

  it('a player proxy at the reserve loses a valuable lot to a rival', () => {
    const s = founded();
    const sid = neighbourOf(s, 1);
    expect(applyCommand(s, { t: 'openAuction', sectionId: sid })).toEqual({ ok: true });
    const a = s.auctions.find((x) => x.lot.sectionId === sid && x.status === 'open')!;
    expect(
      applyCommand(s, { t: 'setProxy', auctionId: a.id, ceilingCents: AUCTION.reserveCents }),
    ).toEqual({ ok: true });
    hours(s, 6);
    expect(a.status).toBe('won');
    expect(a.winner).not.toBe(PLAYER);
    expect(a.priceCents).toBeGreaterThan(AUCTION.reserveCents);
  });

  it('the cautious miner keeps D/E under 0.4; the expander borrows to build', () => {
    const s = founded();
    // LM 8,000 left each: their best builds now wait on cash.
    drain(s, 1, 800_000);
    drain(s, 2, 800_000);
    let worst = 0;
    const sent = recording(s, 72, () => {
      worst = Math.max(worst, debtToEquity(s, 2));
    });
    expect(worst).toBeLessThan(0.4);
    expect(sent.some((e) => e.actor === 1 && e.cmd.t === 'takeLoan')).toBe(true);
  });

  it('the financier buys shares trading under 0.85 of fundamental value', () => {
    const s = founded();
    // 20,000 new Tycho shares at market clear at the floor, a fifth of their value.
    expect(applyCommand(s, { t: 'issueShares', qty: 20_000 }, 1)).toEqual({ ok: true });
    const sent = recording(s, 2);
    expect(
      sent.some(
        (e) =>
          e.actor === 3 &&
          e.cmd.t === 'placeShareOrder' &&
          e.cmd.target === 1 &&
          e.cmd.side === 'buy',
      ),
    ).toBe(true);
  });

  it('no rival bids or borrows past its headroom', () => {
    const s = founded();
    drain(s, 1, 800_000);
    for (const co of [3, 4]) {
      openLot(
        s,
        { kind: 'section', sectionId: neighbourOf(s, co) },
        null,
        AUCTION.reserveCents,
        [],
      );
    }
    const sent = recording(s, 48);
    const proxies = sent.filter((e) => e.cmd.t === 'setProxy');
    const loans = sent.filter((e) => e.cmd.t === 'takeLoan');
    expect(proxies.length).toBeGreaterThan(0);
    expect(loans.length).toBeGreaterThan(0);
    for (const e of proxies) {
      const ceiling = e.cmd.t === 'setProxy' ? e.cmd.ceilingCents! : 0;
      expect(ceiling + e.committed).toBeLessThanOrEqual(e.headroom);
    }
    for (const e of loans) {
      expect(e.cmd.t === 'takeLoan' && e.cmd.amountCents).toBeLessThanOrEqual(e.headroom);
    }
  });

  it('a rival bids for land from cash, keeping 3 days of wages, not from its credit line', () => {
    const s = founded();
    drain(s, 1, 6_000_000);
    const lot = openLot(
      s,
      { kind: 'section', sectionId: neighbourOf(s, 1) },
      null,
      AUCTION.reserveCents,
      [],
    );
    const sent = recording(s, 1);
    const proxy = sent.find((e) => e.actor === 1 && e.cmd.t === 'setProxy');
    const wagesPerDay = 24 * payrollCentsPerHour(s, 1);
    expect(lot.proxies.find((p) => p.companyId === 1)?.ceilingCents ?? 0).toBeLessThanOrEqual(
      6_000_000 - 3 * wagesPerDay,
    );
    expect(proxy === undefined || proxy.headroom > 6_000_000).toBe(true);
  });

  it('a rival repays its drawn credit line once its cash allows', () => {
    const s = founded();
    // Grey Ledger draws LM 50,000; its starting cash covers that many times over.
    expect(applyCommand(s, { t: 'drawCredit', amountCents: 5_000_000 }, 3)).toEqual({ ok: true });
    hours(s, 2);
    expect(s.companies.find((c) => c.id === 3)!.credit.creditDrawnCents).toBe(0);
  });

  it('rivals pay their archetype dividend ratio after the first close', () => {
    const s = founded();
    const rivals = s.companies.filter((c) => c.kind === 'rival');
    hours(s, 2);
    for (const c of rivals) expect(listingOf(s, c.id)!.dividendRatio).toBe(0);
    for (const c of s.companies) closeMonth(s, c.id, '2091-03');
    hours(s, 1);
    for (const c of rivals) {
      expect(listingOf(s, c.id)!.dividendRatio).toBe(ARCHETYPES[c.archetype!].dividendRatio);
    }
  });
});

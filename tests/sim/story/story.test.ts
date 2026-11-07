import { describe, expect, it } from 'vitest';
import { AUCTION } from '../../../src/data/auctions';
import { NARRATOR_LINES } from '../../../src/data/companions/narrator';
import { VETERAN_LINES } from '../../../src/data/companions/veteran';
import { sectionState } from '../../../src/sim/build/sections';
import { deserializeState, serializeState } from '../../../src/save/serialize';
import { PLAYER } from '../../../src/sim/companies';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import { TUTORIAL } from '../../../src/sim/story/beats';
import type { SimEvent } from '../../../src/sim/events';
import { currentLine } from '../../../src/sim/story/story';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const freeBuildPlot = (s: GameState) =>
  world.plots.find(
    (p) =>
      p.sectionId === home && p.kind === 'build' && !s.buildings.some((b) => b.plotId === p.id),
  )!;
const deposit = (good: string) =>
  world.plots.find((p) => p.sectionId === home && p.deposit?.goodId === good)!;

function founded(): GameState {
  const s = createGame(42, { rivals: false });
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function run(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) step(s, { mode: 'fine' });
}

function complete(s: GameState, plotId: number, type: 'mine' | 'smelter' | 'electrolysisPlant') {
  expect(applyCommand(s, { t: 'build', plotId, type })).toEqual({ ok: true });
  const b = s.buildings.find((x) => x.plotId === plotId)!;
  b.status = 'active';
  b.progress = 1;
  return b;
}

describe('story', () => {
  it('founding queues ch1.founding first, spoken by Ox Varga', () => {
    const s = founded();
    expect(s.story.queue).toEqual(['ch1.founding']);
    const line = currentLine(s, VETERAN_LINES, NARRATOR_LINES)!;
    expect(line.speaker).toBe('Ox Varga');
    expect(line.lines[0]).toContain('Ox Varga');
  });

  it('tutorial beats fire once and in order', () => {
    const s = founded();
    applyCommand(s, { t: 'storyAck', beatId: 'ch1.founding' });
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.camera']);
    applyCommand(s, { t: 'cameraTaught', panned: true });
    run(s, 1);
    expect(s.story.done).not.toContain('ch1.camera');
    applyCommand(s, { t: 'cameraTaught', zoomed: true });
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.firstMine']);
    applyCommand(s, { t: 'build', plotId: deposit('ilmenite').id, type: 'mine' });
    run(s, 1);
    expect(s.story.queue).toEqual([]);
    const mine = s.buildings.find((b) => b.type === 'mine')!;
    mine.status = 'active';
    mine.progress = 1;
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.belts']);
    applyCommand(s, { t: 'storyAck', beatId: 'ch1.founding' });
    run(s, 1);
    expect(s.story.seen).toEqual(TUTORIAL.slice(0, 4));
  });

  it('ch1.power interrupts on the first brownout', () => {
    const s = founded();
    complete(s, freeBuildPlot(s).id, 'smelter');
    complete(s, freeBuildPlot(s).id, 'electrolysisPlant');
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.power', 'ch1.founding']);
  });

  it('a missing veteran line falls back to the narrator', () => {
    const s = founded();
    expect(currentLine(s, { ...VETERAN_LINES, 'ch1.founding': [] }, NARRATOR_LINES)).toEqual({
      beatId: 'ch1.founding',
      speaker: 'Narrator',
      lines: NARRATOR_LINES['ch1.founding'],
    });
  });

  it('muted categories record beats but show nothing', () => {
    const s = founded();
    applyCommand(s, { t: 'setHintMute', category: 'tutorial', muted: true });
    expect(s.story.queue).toEqual([]);
    expect(s.story.done).toContain('ch1.founding');
    run(s, 1);
    expect(s.story.seen).toContain('ch1.camera');
    expect(currentLine(s, VETERAN_LINES, NARRATOR_LINES)).toBeNull();
    applyCommand(s, { t: 'setHintMute', category: 'tutorial', muted: false });
    expect(s.story.muted).toEqual([]);
  });

  it('first sale unlocks concept.orderBook and concept.priceImpact', () => {
    const s = founded();
    const before = TUTORIAL.slice(0, TUTORIAL.indexOf('ch1.firstSale'));
    s.story.seen = [...before];
    s.story.done = [...before];
    s.story.queue = [];
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.firstSale']);
    expect(s.story.codex).not.toContain('concept.orderBook');
    sectionState(s, home)!.depot.ilmenite = 1000;
    applyCommand(s, {
      t: 'placeOrder',
      goodId: 'ilmenite',
      side: 'sell',
      kind: 'market',
      qtyKg: 1000,
      sectionId: home,
    });
    run(s, 60);
    expect(s.story.done).toContain('ch1.firstSale');
    expect(s.story.codex).toEqual(
      expect.arrayContaining(['concept.orderBook', 'concept.priceImpact']),
    );
  });

  it('ch1.expansion completes when the player wins an auction', () => {
    const s = founded();
    const before = TUTORIAL.slice(0, TUTORIAL.indexOf('ch1.expansion'));
    s.story.seen = [...before];
    s.story.done = [...before];
    s.story.queue = [];
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.expansion']);
    const next = world.sections[home]!.neighbors[0]!;
    expect(applyCommand(s, { t: 'openAuction', sectionId: next })).toEqual({ ok: true });
    const lot = s.auctions.find((a) => a.lot.sectionId === next)!;
    applyCommand(s, { t: 'setProxy', auctionId: lot.id, ceilingCents: 20_000_000 });
    run(s, AUCTION.durationTicks - 10);
    expect(s.story.done).not.toContain('ch1.expansion');
    run(s, 15);
    expect(lot).toMatchObject({ status: 'won', winner: PLAYER });
    expect(s.story.done).toContain('ch1.expansion');
    expect(s.story.codex).toContain('mech.auctions');
  });

  it('a saved mech.landOffice entry loads as mech.auctions', () => {
    const s = founded();
    s.story.codex.push('mech.landOffice');
    const saved = JSON.parse(JSON.stringify(serializeState(s))) as Record<string, unknown>;
    saved.landPurchases = 1;
    const back = deserializeState(saved);
    expect(back.story.codex).toContain('mech.auctions');
    expect(back.story.codex).not.toContain('mech.landOffice');
    expect('landPurchases' in back).toBe(false);
  });

  it('a rival stake of 20% in the player fires ev.rivalStake; a rival stake in another rival fires nothing', () => {
    const s = founded();
    s.pendingEvents.push({ t: 'stakeDisclosed', holder: 1, companyId: 2, pct: 0.2 });
    run(s, 1);
    expect(s.story.seen).not.toContain('ev.rivalStake');
    s.pendingEvents.push({ t: 'stakeDisclosed', holder: 1, companyId: PLAYER, pct: 0.2 });
    run(s, 1);
    expect(s.story.queue).toContain('ev.rivalStake');
  });

  it('the first close unlocks the statement concepts', () => {
    const s = founded();
    s.pendingEvents.push({ t: 'monthClosed', companyId: 1, label: 'Mar 2091', netIncomeCents: 0 });
    run(s, 1);
    expect(s.story.codex).not.toContain('mech.statements');
    s.pendingEvents.push({
      t: 'monthClosed',
      companyId: PLAYER,
      label: 'Mar 2091',
      netIncomeCents: 0,
    });
    run(s, 1);
    expect(s.story.codex).toEqual(
      expect.arrayContaining([
        'mech.statements',
        'mech.monthlyClose',
        'concept.balanceSheet',
        'concept.incomeStatement',
        'concept.cashFlow',
      ]),
    );
    expect(s.story.queue).toContain('ev.firstClose');
  });

  it('first contacts with money open their Codex entries', () => {
    const s = founded();
    expect(s.story.codex).toContain('mech.rivals');
    const push = (...events: SimEvent[]) => s.pendingEvents.push(...events);
    push(
      { t: 'auctionOpened', auctionId: 90, sectionId: 3, companyId: null },
      { t: 'ratingChanged', companyId: PLAYER, from: 'BBB', to: 'BB' },
      { t: 'shareTrade', companyId: PLAYER, orderId: 1, target: 1, side: 'buy', qty: 5, cents: 9 },
      {
        t: 'shareTrade',
        companyId: PLAYER,
        orderId: 2,
        target: PLAYER,
        side: 'sell',
        qty: 5,
        cents: 9,
      },
      {
        t: 'shareTrade',
        companyId: PLAYER,
        orderId: 3,
        target: PLAYER,
        side: 'buy',
        qty: 5,
        cents: 9,
      },
      { t: 'dividendPaid', companyId: PLAYER, perShareCents: 3 },
      { t: 'defaulted', companyId: 1, owedCents: 100 },
      { t: 'bankrupt', companyId: 1 },
    );
    run(s, 1);
    expect(s.story.codex).toEqual(
      expect.arrayContaining([
        'mech.auctions',
        'concept.englishAuction',
        'concept.creditRating',
        'concept.shares',
        'concept.priceEarnings',
        'concept.dilution',
        'concept.buyback',
        'concept.dividends',
        'concept.default',
        'concept.bankruptcy',
      ]),
    );
    expect(s.story.queue).toEqual(expect.arrayContaining(['ev.ratingCut', 'ev.rivalBankrupt']));
    expect(s.story.codex).not.toContain('concept.proxyBid');
    expect(applyCommand(s, { t: 'takeLoan', amountCents: 1_000_000, months: 3 })).toEqual({
      ok: true,
    });
    const next = world.sections[home]!.neighbors[0]!;
    applyCommand(s, { t: 'openAuction', sectionId: next });
    const lot = s.auctions.find((a) => a.lot.sectionId === next)!;
    applyCommand(s, { t: 'setProxy', auctionId: lot.id, ceilingCents: 5_000_000 });
    run(s, 60);
    expect(s.story.codex).toEqual(
      expect.arrayContaining(['concept.proxyBid', 'mech.loans', 'concept.interest']),
    );
  });

  it('rivals: their first lot fires ev.rivalsIntro; a lot the player bid on and lost fires ev.auctionLost', () => {
    const s = founded();
    s.pendingEvents.push({ t: 'auctionOpened', auctionId: 90, sectionId: 3, companyId: null });
    run(s, 1);
    expect(s.story.seen).not.toContain('ev.rivalsIntro');
    s.pendingEvents.push({ t: 'auctionOpened', auctionId: 91, sectionId: 4, companyId: 1 });
    run(s, 1);
    expect(s.story.queue).toContain('ev.rivalsIntro');
    const next = world.sections[home]!.neighbors[0]!;
    applyCommand(s, { t: 'openAuction', sectionId: next });
    const lot = s.auctions.find((a) => a.lot.sectionId === next)!;
    applyCommand(s, { t: 'placeBid', auctionId: lot.id, amountCents: AUCTION.reserveCents });
    s.pendingEvents.push({
      t: 'auctionWon',
      auctionId: 90,
      companyId: 1,
      sectionId: 3,
      amountCents: 1,
    });
    run(s, 1);
    expect(s.story.seen).not.toContain('ev.auctionLost');
    s.pendingEvents.push({
      t: 'auctionWon',
      auctionId: lot.id,
      companyId: 1,
      sectionId: next,
      amountCents: 1,
    });
    run(s, 1);
    expect(s.story.queue).toContain('ev.auctionLost');
  });

  it('event beats fire at most once per 6 game hours', () => {
    const s = founded();
    const strike = () => s.pendingEvents.push({ t: 'strike', companyId: 0, buildingId: 1 });
    strike();
    run(s, 1);
    expect(s.story.queue).toContain('ev.strike');
    applyCommand(s, { t: 'storyAck', beatId: 'ev.strike' });
    strike();
    run(s, 1);
    expect(s.story.queue).not.toContain('ev.strike');
    run(s, 359);
    strike();
    run(s, 1);
    expect(s.story.queue).toContain('ev.strike');
  });

  it('the Codex opens up as goods and buildings appear', () => {
    const s = founded();
    expect(s.story.codex).toEqual(
      expect.arrayContaining(['good.prefabStructures', 'building.solarArray', 'mech.sections']),
    );
    expect(s.story.codex).not.toContain('concept.temporalArbitrage');
  });
});

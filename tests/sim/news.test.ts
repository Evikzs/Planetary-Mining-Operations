import { describe, expect, it } from 'vitest';
import { newsText } from '../../src/data/copy';
import { PLAYER } from '../../src/sim/companies';
import { applyCommand, createGame, step, type StepContext } from '../../src/sim/engine';
import type { SimEvent } from '../../src/sim/events';
import { NEWS_TYPES, newsSystem } from '../../src/sim/news';
import type { GameState } from '../../src/sim/state';

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}
const run = (s: GameState, events: SimEvent[]) =>
  newsSystem.step(s, { mode: 'fine', events } as unknown as StepContext);

describe('news', () => {
  it('news keeps the latest 30 public events, newest first', () => {
    const s = founded();
    for (let i = 0; i < 40; i++) {
      run(s, [
        { t: 'auctionOpened', auctionId: i, sectionId: i % 60, companyId: null },
        // A private event is no news.
        { t: 'strike', buildingId: 1, companyId: 1 },
      ]);
      s.tick += 60;
    }
    expect(s.news).toHaveLength(30);
    expect(s.news[0]).toMatchObject({ t: 'auctionOpened', auctionId: 39, tick: 39 * 60 });
    expect(s.news.at(-1)).toMatchObject({ auctionId: 10 });
    expect(s.news.every((n) => NEWS_TYPES.has(n.t))).toBe(true);
  });

  it('a running game reports the Authority lot of the twelfth hour', () => {
    const s = founded();
    for (let h = 0; h < 13; h++) step(s, { mode: 'coarse' });
    expect(s.news.some((n) => n.t === 'auctionOpened' && n.companyId === null)).toBe(true);
  });

  it('says each kind of news in a plain sentence', () => {
    const name = (id: number) => (id === PLAYER ? 'You' : `Rival ${id}`);
    const say = (e: SimEvent) => newsText({ ...e, tick: 0 }, name);
    expect(say({ t: 'auctionOpened', auctionId: 1, sectionId: 23, companyId: null })).toBe(
      'The Lunar Authority put section 23 up for auction.',
    );
    expect(
      say({ t: 'auctionWon', auctionId: 1, sectionId: 23, companyId: 2, amountCents: 4_840_749 }),
    ).toBe('Rival 2 won section 23 for LM 48,407.49.');
    expect(say({ t: 'ratingChanged', companyId: 3, from: 'BBB', to: 'CCC' })).toBe(
      "Rival 3's credit rating fell from BBB to CCC.",
    );
    expect(say({ t: 'bankrupt', companyId: 1 })).toBe(
      'Rival 1 went bankrupt. Its sections go to auction.',
    );
    for (const t of NEWS_TYPES) expect(typeof t).toBe('string');
  });
});

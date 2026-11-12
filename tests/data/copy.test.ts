import { describe, expect, it } from 'vitest';
import { CODEX } from '../../src/data/codex';
import { NARRATOR_LINES } from '../../src/data/companions/narrator';
import { VETERAN_LINES } from '../../src/data/companions/veteran';
import { alertText, ERROR_COPY } from '../../src/data/copy';

describe('copy', () => {
  it('every CommandError has copy', () => {
    expect(ERROR_COPY).toEqual({
      NOT_OWNED: 'You do not own this section.',
      PLOT_OCCUPIED: 'This plot already has a building.',
      WRONG_PLOT_KIND: 'This building cannot go on this kind of plot.',
      NO_DEPOSIT_MATCH: 'This deposit does not hold what this building extracts.',
      INSUFFICIENT_CASH: 'Not enough cash.',
      INSUFFICIENT_MATERIALS: "Not enough materials in this section's depot.",
      NO_ROAD_ACCESS: 'No road can reach this plot. The ground around it is too steep.',
      MAX_LEVEL: 'This building is at the highest level.',
      INVALID_NAME: 'Use 3 to 32 letters, numbers or spaces.',
      CONTRACT_LIMIT: 'You hold the most contracts your reputation allows.',
      INSUFFICIENT_STOCK: 'Not enough stock in this depot.',
      INVALID_ORDER: 'Check the amount and the price.',
      STORAGE_FULL: 'The depot is full.',
      UNKNOWN_ID: 'That item no longer exists.',
      NOT_FOUNDED: 'Found your company first.',
      ALREADY_FOUNDED: 'Your company already exists.',
      COMPANION_UNAVAILABLE: 'This companion arrives in a later update.',
      INVALID_RECIPE: 'This building cannot use that recipe.',
      BUSY: 'Wait until the work on this building is done.',
      NOT_ACTIVE: 'This contract is not active.',
      CANNOT_DEMOLISH: 'This building cannot be demolished.',
      CREDIT_LIMIT: 'That is more than your credit allows.',
      NO_CREDIT: 'Lenders give no credit at rating D.',
      INSUFFICIENT_SHARES: 'You do not hold that many shares.',
      ISSUE_LIMIT: 'You can issue at most 20% more shares each month.',
      NOT_FOR_SALE: 'This section is not for sale now.',
      BID_TOO_LOW: 'Bid at least the minimum shown.',
      AUCTION_CLOSED: 'This auction has ended.',
      AUCTION_LIMIT: 'Too many auctions are open. Wait until one ends.',
      LOW_REPUTATION: 'Your reputation is too low to bid.',
      NO_OPEN_SLOT: 'This building has no open job for this worker.',
    });
  });

  it('alerts read as short plain sentences', () => {
    const names = { building: () => 'Mine', belt: () => 'Smelter' };
    expect(
      alertText(
        { t: 'shortage', companyId: 0, sectionId: 3, need: 'air', daysLeft: 2.4, tick: 0 },
        names,
      ),
    ).toBe('Oxygen runs out in about 2 days in section 3.');
    expect(
      alertText(
        { t: 'shortage', companyId: 0, sectionId: 3, need: 'food', daysLeft: 0.4, tick: 0 },
        names,
      ),
    ).toBe('Food runs out in less than a day in section 3.');
    expect(
      alertText({ t: 'brownout', companyId: 0, sectionId: 3, factor: 0.62, tick: 0 }, names),
    ).toBe('Section 3 is short of power. Machines run at 62%.');
    expect(alertText({ t: 'beltJammed', companyId: 0, beltId: 9, tick: 0 }, names)).toBe(
      'The Smelter belt is jammed. Its depot is full.',
    );
    expect(alertText({ t: 'strike', companyId: 0, buildingId: 4, tick: 0 }, names)).toBe(
      'Workers at the Mine are on strike.',
    );
    expect(alertText({ t: 'emigration', companyId: 0, count: 1, tick: 0 }, names)).toBe(
      '1 worker left the colony.',
    );
    expect(alertText({ t: 'emigration', companyId: 0, count: 3, tick: 0 }, names)).toBe(
      '3 workers left the colony.',
    );
    expect(alertText({ t: 'contractFailed', companyId: 0, contractId: 2, tick: 0 }, names)).toBe(
      'A contract failed. You lost reputation.',
    );
    expect(alertText({ t: 'priceMove', goodId: 'ilmenite', pct24h: -0.34, tick: 0 }, names)).toBe(
      'Ilmenite fell 34% in a day.',
    );
    expect(alertText({ t: 'priceMove', goodId: 'steel', pct24h: 0.31, tick: 0 }, names)).toBe(
      'Steel rose 31% in a day.',
    );
  });
});

const MOBILE_WORDS =
  /\b(tap|taps|tapping|tapped|phone|phones|swipe|pinch|twist|fingers?|real (minute|second)s?)\b/i;

describe('player-facing copy', () => {
  it('never says tap, phone, swipe or real minutes', () => {
    const texts = [
      ...Object.values(CODEX).flatMap((e) => [e.title, e.body]),
      ...Object.values(NARRATOR_LINES).flat(),
      ...Object.values(VETERAN_LINES).flat(),
      ...Object.values(ERROR_COPY),
    ];
    expect(texts.filter((t) => MOBILE_WORDS.test(t))).toEqual([]);
  });
});

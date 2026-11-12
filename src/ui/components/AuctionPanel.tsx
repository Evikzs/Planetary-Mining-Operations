import { useId, useState } from 'preact/hooks';
import { ui } from '../../client/store';
import { AUCTION } from '../../data/auctions';
import { formatGameDate } from '../../sim/clock';
import type { AuctionView, UiSnapshot } from '../../sim/views';
import { formatGameDuration, formatMoney } from '../format';
import { nameOf } from '../tabs/FinanceTab';
import { ErrorText, useCommand } from './command';

export const LOT_KIND: Record<AuctionView['lot']['kind'], string> = {
  section: 'Section rights',
  assets: 'Company assets',
};

/** 'You', a rival's name, or 'No bids'. */
export const leaderOf = (snap: UiSnapshot, a: AuctionView): string =>
  a.leader === null ? 'No bids' : nameOf(snap)(a.leader);

/** Game time until a lot closes: '2 h 40 min'. */
export const timeLeft = (snap: UiSnapshot, a: AuctionView): string =>
  formatGameDuration(a.endTick - snap.tick);

const toCents = (lm: string) => Math.round(Number(lm) * 100);
const valid = (cents: number) => Number.isSafeInteger(cents) && cents > 0;

/** Puts an unowned section up for auction, for the listing fee. */
export function OpenAuction({ sectionId }: { sectionId: number }) {
  const { error, run } = useCommand();
  return (
    <>
      <button
        type="button"
        class="action"
        onClick={() => void run({ t: 'openAuction', sectionId })}
      >
        Open an auction — {formatMoney(AUCTION.listingFeeCents)}
      </button>
      <p class="meta">Reserve {formatMoney(AUCTION.reserveCents)}</p>
      <ErrorText error={error} />
    </>
  );
}

/** One lot, live: the leader, your minimum bid, a bid, a proxy, and when it ends. */
export function AuctionPanel({ auctionId }: { auctionId: number }) {
  const { error, run } = useCommand();
  const [bid, setBid] = useState('');
  const [ceiling, setCeiling] = useState('');
  const id = useId();
  const snap = ui.value;
  const a = snap?.auctions.find((x) => x.id === auctionId);
  if (!snap || !a) return null;
  const facts: [string, string][] = [
    ['Lot', LOT_KIND[a.lot.kind]],
    [
      'Leader',
      a.leaderAmountCents === null
        ? 'No bids'
        : `${leaderOf(snap, a)}, ${formatMoney(a.leaderAmountCents)}`,
    ],
  ];
  if (a.status === 'open') {
    if (a.myMinBidCents !== null) facts.push(['Your minimum bid', formatMoney(a.myMinBidCents)]);
    facts.push(
      ['Your proxy', a.myProxyCents === null ? 'None' : formatMoney(a.myProxyCents)],
      ['Ends', `${formatGameDate(a.endTick)}, ${timeLeft(snap, a)}`],
    );
  } else {
    facts.push([
      'Result',
      a.winner === null
        ? 'Unsold'
        : `Won by ${nameOf(snap)(a.winner)} for ${formatMoney(a.priceCents ?? 0)}`,
    ]);
  }
  const bidCents = toCents(bid);
  const ceilingCents = toCents(ceiling);
  return (
    <section class="auction" aria-label={`Auction for section ${a.lot.sectionId}`}>
      <dl class="facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd class="num">{value}</dd>
          </div>
        ))}
      </dl>
      {a.status === 'open' && (
        <>
          <div class="order-form">
            <div class="fields">
              <label for={`${id}-bid`}>Bid (LM)</label>
              <input
                id={`${id}-bid`}
                type="number"
                inputMode="decimal"
                min="0"
                step="1000"
                value={bid}
                onInput={(e) => setBid(e.currentTarget.value)}
              />
            </div>
            <div class="buttons">
              <button
                type="button"
                class="action"
                disabled={!valid(bidCents)}
                onClick={() =>
                  void run({ t: 'placeBid', auctionId, amountCents: bidCents }).then(
                    (done) => done && setBid(''),
                  )
                }
              >
                Bid
              </button>
            </div>
          </div>
          <div class="order-form">
            <div class="fields">
              <label for={`${id}-proxy`}>Bid for me up to (LM)</label>
              <input
                id={`${id}-proxy`}
                type="number"
                inputMode="decimal"
                min="0"
                step="1000"
                value={ceiling}
                onInput={(e) => setCeiling(e.currentTarget.value)}
              />
            </div>
            <div class="buttons">
              <button
                type="button"
                class="action"
                disabled={!valid(ceilingCents)}
                onClick={() => void run({ t: 'setProxy', auctionId, ceilingCents })}
              >
                Set
              </button>
              <button
                type="button"
                class="action quiet"
                disabled={a.myProxyCents === null}
                onClick={() => void run({ t: 'setProxy', auctionId, ceilingCents: null })}
              >
                Remove
              </button>
            </div>
          </div>
        </>
      )}
      <ErrorText error={error} />
    </section>
  );
}

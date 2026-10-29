import { useEffect, useRef, useState } from 'preact/hooks';
import {
  motion,
  pinnedGoods,
  recentFills,
  selection,
  simClient,
  ui,
  world,
} from '../../client/store';
import { ERROR_COPY } from '../../data/copy';
import { GOODS, type GoodId } from '../../data/goods';
import type { Command } from '../../sim/commands';
import type { Order } from '../../sim/market/orders';
import type { UiSnapshot } from '../../sim/views';
import { ErrorText, useCommand } from '../components/command';
import { PriceChart } from '../components/PriceChart';
import { Trend } from '../components/Trend';
import { formatMass, formatMoney, formatNumber } from '../format';
import { Icon } from '../icons';
import { sectionOfPick } from '../shell/sectionOf';

type Run = (cmd: Command) => Promise<boolean>;
type Market = UiSnapshot['market'][number];
type Section = UiSnapshot['sections'][number];

const SIDES: { id: Order['side']; label: string }[] = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
];
const KINDS: { id: Order['kind']; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'standing', label: 'Standing' },
];

/** '+2.1%' or '−3.4%', with a true minus sign. */
const percent = (change: number): string =>
  `${change < 0 ? '−' : '+'}${Math.abs(change * 100).toFixed(1)}%`;

function orderTerms(o: Order): string {
  if (o.kind === 'market') return 'at market';
  const limit = `${o.side === 'sell' ? 'no lower than' : 'no higher than'} ${formatMoney(o.limitCents ?? 0)}/t`;
  return o.kind === 'standing' ? `${formatMass(o.dailyQtyKg ?? 0)} a day, ${limit}` : limit;
}

function Choices<T extends string>(props: {
  legend: string;
  name: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset class="field-set">
      <legend>{props.legend}</legend>
      <div class="choices">
        {props.options.map((o) => (
          <label key={o.id} class="choice">
            <input
              type="radio"
              name={props.name}
              checked={props.value === o.id}
              onChange={() => props.onChange(o.id)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function OrderForm(props: {
  good: GoodId;
  sections: Section[];
  home: number;
  run: Run;
  hour: number;
}) {
  const { good, run } = props;
  const [side, setSide] = useState<Order['side']>('sell');
  const [kind, setKind] = useState<Order['kind']>('market');
  const [amount, setAmount] = useState('10');
  const [limit, setLimit] = useState('');
  const [sectionId, setSectionId] = useState(props.home);
  const [quote, setQuote] = useState<{ priceCents: number; filledKg: number } | null>(null);
  const kg = Math.round(Number(amount) * 1000);
  const validKg = Number.isSafeInteger(kg) && kg > 0;
  const limitCents = Math.round(Number(limit) * 100);
  const needsLimit = kind !== 'market';
  const canPlace = validKg && (!needsLimit || (Number.isSafeInteger(limitCents) && limitCents > 0));
  const asked = useRef('');

  // The quote follows the form 300 ms after its last change, and each new game hour.
  useEffect(() => {
    const key = `${good}|${side}|${kg}`;
    if (asked.current !== key) setQuote(null);
    asked.current = key;
    if (!validKg) return;
    let live = true;
    const timer = setTimeout(() => {
      void simClient.value?.quote(good, side, kg).then((q) => {
        if (live) setQuote(q);
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [good, side, kg, props.hour]);

  return (
    <form
      class="order-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canPlace) return;
        void run({
          t: 'placeOrder',
          goodId: good,
          side,
          kind,
          qtyKg: kg,
          limitCents: needsLimit ? limitCents : undefined,
          sectionId,
        });
      }}
    >
      <Choices legend="Side" name="trade-side" options={SIDES} value={side} onChange={setSide} />
      <Choices legend="Order" name="trade-kind" options={KINDS} value={kind} onChange={setKind} />
      <div class="fields">
        <label for="trade-amount">
          {kind === 'standing' ? 'Amount per day (t)' : 'Amount (t)'}
        </label>
        <input
          id="trade-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.1"
          value={amount}
          onInput={(e) => setAmount(e.currentTarget.value)}
        />
        {needsLimit && (
          <>
            <label for="trade-limit">Limit price (LM/t)</label>
            <input
              id="trade-limit"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={limit}
              onInput={(e) => setLimit(e.currentTarget.value)}
            />
          </>
        )}
        <label for="trade-depot">Depot</label>
        <select
          id="trade-depot"
          value={sectionId}
          onChange={(e) => setSectionId(Number(e.currentTarget.value))}
        >
          {props.sections.map((s) => (
            <option key={s.id} value={s.id}>
              Section {s.id}
            </option>
          ))}
        </select>
      </div>
      <p class="quote num" data-testid="quote" aria-live="polite">
        {quote
          ? `Estimated price ${formatMoney(quote.priceCents)}/t, fills ${formatMass(quote.filledKg)}`
          : validKg
            ? 'Asking the market.'
            : 'Enter an amount.'}
      </p>
      <button type="submit" class="action" disabled={!canPlace}>
        Place order
      </button>
    </form>
  );
}

function OpenOrders({ orders, run }: { orders: Order[]; run: Run }) {
  return (
    <>
      <h3>Open orders</h3>
      <ul class="orders" aria-label="Open orders">
        {orders.length === 0 && <li class="empty">No open orders.</li>}
        {orders.map((o) => (
          <li key={o.id}>
            <span>
              {o.side === 'sell' ? 'Sell' : 'Buy'} {formatMass(o.qtyKg - o.filledKg)}{' '}
              {GOODS[o.goodId].name}
              <span class="meta">
                {orderTerms(o)}, section {o.sectionId}
              </span>
            </span>
            <button
              type="button"
              class="action small quiet"
              onClick={() => void run({ t: 'cancelOrder', orderId: o.id })}
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** What the market filled for the player lately, newest first. */
function RecentFills() {
  const fills = recentFills.value;
  return (
    <>
      <h3>Recent fills</h3>
      <ul class="orders" aria-label="Recent fills">
        {fills.length === 0 && <li class="empty">No fills yet.</li>}
        {fills.map((f, i) => (
          <li key={`${f.orderId}-${i}`}>
            <span>
              {f.side === 'sell' ? 'Sold' : 'Bought'} {formatMass(f.kg)} {GOODS[f.goodId].name}{' '}
              {f.side === 'sell' ? 'for' : 'at'} <span class="num">{formatMoney(f.cents)}</span>
              <span class="meta">{formatMoney(Math.round((f.cents * 1000) / f.kg))}/t</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function GoodsTable(props: {
  market: Market[];
  stock: Section['stockKg'];
  chosen: GoodId | null;
  onChoose: (g: GoodId) => void;
}) {
  const pinned = pinnedGoods.value;
  const togglePin = (g: GoodId) =>
    (pinnedGoods.value = pinned.includes(g) ? pinned.filter((x) => x !== g) : [...pinned, g]);
  return (
    <table class="goods-table">
      <caption>Lunar market</caption>
      <thead>
        <tr>
          <th scope="col">Good</th>
          <th scope="col">Stock</th>
          <th scope="col">LM/t</th>
          <th scope="col">24 h</th>
          <th scope="col">
            <span class="visually-hidden">Top bar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.market.map((m) => {
          const name = GOODS[m.goodId].name;
          return (
            <tr key={m.goodId}>
              <th scope="row">
                <button
                  type="button"
                  aria-pressed={props.chosen === m.goodId}
                  onClick={() => props.onChoose(m.goodId)}
                >
                  {name}
                </button>
              </th>
              <td class="num">{formatMass(props.stock[m.goodId] ?? 0)}</td>
              <td class="num">{formatNumber(m.lastCents / 100, 2)}</td>
              <td class="num">
                <Trend history={m.history} /> {percent(m.change24h)}
              </td>
              <td>
                <button
                  type="button"
                  class="icon-button pin"
                  aria-pressed={pinned.includes(m.goodId)}
                  aria-label={`Pin ${name} to the top bar`}
                  onClick={() => togglePin(m.goodId)}
                >
                  <Icon name="pin" size={18} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The Lunar market: every good's price and trend, a chart and order form, and open orders. */
export function TradeTab() {
  const { error, run } = useCommand();
  const [good, setGood] = useState<GoodId | null>(null);
  const detail = useRef<HTMLElement>(null);
  // A newly chosen good brings its chart and order form into view, above the table.
  useEffect(() => {
    const reduced = document.documentElement.dataset.motion === 'reduced';
    if (good)
      detail.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [good]);
  const snap = ui.value;
  const founding = snap?.sections[0];
  if (!snap?.company || !founding) return <p>{ERROR_COPY.NOT_FOUNDED}</p>;
  const pick = selection.value;
  const w = world.value;
  const picked = pick && w ? sectionOfPick(pick, w, motion.value?.view.trips ?? []) : null;
  // The founding section comes first.
  const section = snap.sections.find((s) => s.id === picked) ?? founding;
  const m = snap.market.find((x) => x.goodId === good);
  return (
    <div class="trade-tab">
      {m && (
        <section class="good-detail" ref={detail} aria-label={GOODS[m.goodId].name}>
          <h3>{GOODS[m.goodId].name}</h3>
          <p>
            <span class="num">{formatMoney(m.lastCents)}</span> a tonne,{' '}
            <span class="num">{percent(m.change24h)}</span> in a day. Section {section.id} holds{' '}
            <span class="num">{formatMass(section.stockKg[m.goodId] ?? 0)}</span>.
          </p>
          <PriceChart history={m.history} label={`${GOODS[m.goodId].name} price, hour by hour`} />
          <OrderForm
            key={m.goodId}
            good={m.goodId}
            sections={snap.sections}
            home={section.id}
            run={run}
            hour={Math.floor(snap.tick / 60)}
          />
        </section>
      )}
      <OpenOrders orders={snap.orders} run={run} />
      <RecentFills />
      <GoodsTable market={snap.market} stock={section.stockKg} chosen={good} onChoose={setGood} />
      <ErrorText error={error} />
    </div>
  );
}

import { useState } from 'preact/hooks';
import { ui } from '../../client/store';
import { ERROR_COPY, newsText } from '../../data/copy';
import { formatGameDate } from '../../sim/clock';
import { PLAYER, type CompanyId } from '../../sim/companies';
import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
} from '../../sim/finance/statements';
import type { FinanceView, UiSnapshot } from '../../sim/views';
import { Choices } from '../components/Choices';
import { ErrorText, useCommand } from '../components/command';
import { LoanForm } from '../components/LoanForm';
import { PriceChart } from '../components/PriceChart';
import { ShareOrderForm } from '../components/ShareOrderForm';
import { StatementTable, type StatementRow } from '../components/StatementTable';
import { Trend } from '../components/Trend';
import { formatChange, formatMoney, formatNumber } from '../format';
import { isDesktop } from '../shell/useBreakpoint';

export const nameOf = (snap: UiSnapshot) => (id: CompanyId) =>
  id === PLAYER ? 'You' : (snap.companies.find((c) => c.id === id)?.name ?? 'A rival');

const incomeRows = (s: IncomeStatement): StatementRow[] => [
  { label: 'Sales', cents: s.revenue.sales },
  { label: 'Contracts', cents: s.revenue.contracts },
  { label: 'Other income', cents: s.revenue.other },
  { label: 'Cost of goods sold', cents: -s.expense.cogs },
  { label: 'Materials', cents: -s.expense.materials },
  { label: 'Life support', cents: -s.expense.lifeSupport },
  { label: 'Wages', cents: -s.expense.wages },
  { label: 'Depreciation', cents: -s.expense.depreciation },
  { label: 'Interest', cents: -s.expense.interest },
  { label: 'Fees', cents: -s.expense.fees },
  { label: 'Write-offs', cents: -s.expense.writeOffs },
  { label: 'Other costs', cents: -s.expense.other },
  { label: 'Net income', cents: s.netIncome, strong: true },
];

function balanceRows(b: BalanceSheet): StatementRow[] {
  const overdue = b.liabilities - b.loans - b.credit;
  return [
    { label: 'Cash', cents: b.cash },
    { label: 'Inventory', cents: b.inventory },
    { label: 'Buildings', cents: b.buildings },
    { label: 'Land', cents: b.land },
    { label: 'Investments', cents: b.investments },
    { label: 'Total assets', cents: b.assets, strong: true },
    { label: 'Loans', cents: b.loans },
    { label: 'Credit line', cents: b.credit },
    ...(overdue > 0 ? [{ label: 'Overdue', cents: overdue }] : []),
    { label: 'Total liabilities', cents: b.liabilities, strong: true },
    { label: 'Share capital', cents: b.shareCapital },
    { label: 'Treasury shares', cents: -b.treasury },
    { label: 'Retained earnings', cents: b.retained },
    { label: 'Net income for the period', cents: b.netIncome },
    { label: 'Equity', cents: b.equity, strong: true },
  ];
}

const cashRows = (c: CashFlowStatement): StatementRow[] => [
  { label: 'Operating', cents: c.operating },
  { label: 'Investing', cents: c.investing },
  { label: 'Financing', cents: c.financing },
  { label: 'Net change in cash', cents: c.net, strong: true },
];

function Statements({ f }: { f: FinanceView }) {
  const [period, setPeriod] = useState('now');
  const closed = f.closed.find((m) => m.label === period);
  const options = [
    { id: 'now', label: 'This month' },
    ...f.closed.map((m) => ({ id: m.label, label: m.label })),
  ];
  return (
    <section aria-labelledby="fin-statements">
      <h3 id="fin-statements">Statements</h3>
      <Choices
        legend="Period"
        name="fin-period"
        options={options}
        value={closed ? period : 'now'}
        onChange={setPeriod}
      />
      <StatementTable caption="Income statement" rows={incomeRows(closed?.income ?? f.period)} />
      <StatementTable caption="Balance sheet" rows={balanceRows(closed?.balance ?? f.balance)} />
      <StatementTable caption="Cash flow" rows={cashRows(closed?.cashFlow ?? f.cashFlow)} />
    </section>
  );
}

const ratio = (n: number | null, digits: number) => (n === null ? '—' : formatNumber(n, digits));

function Ratios({ f }: { f: FinanceView }) {
  const r = f.ratios;
  const rows: [string, string][] = [
    ['Earnings per share', r.eps === null ? '—' : formatMoney(r.eps)],
    ['Price to earnings', ratio(r.pe, 1)],
    ['Return on equity', r.roe === null ? '—' : `${formatNumber(r.roe * 100, 1)}%`],
    ['Debt to equity', ratio(r.debtToEquity, 2)],
    ['Interest cover', ratio(r.interestCover, 1)],
    ['Current ratio', ratio(r.currentRatio, 2)],
    ['Credit rating', f.rating],
  ];
  return (
    <section aria-labelledby="fin-ratios">
      <h3 id="fin-ratios">Ratios and rating</h3>
      {f.inDefault && (
        <p class="warning">In default. Lenders sell your stock until what is overdue is paid.</p>
      )}
      <dl class="facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd class="num">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Debt({ f }: { f: FinanceView }) {
  const { error, run } = useCommand();
  const [amount, setAmount] = useState('');
  const cents = Math.round(Number(amount) * 100);
  const ok = Number.isSafeInteger(cents) && cents > 0;
  return (
    <section aria-labelledby="fin-debt">
      <h3 id="fin-debt">Loans and credit</h3>
      <LoanForm finance={f} run={run} />
      <ul class="orders" aria-label="Loans">
        {f.loans.length === 0 && <li class="empty">No loans.</li>}
        {f.loans.map((l) => (
          <li key={l.id}>
            <span>
              <span class="num">{formatMoney(l.principalCents)}</span> at{' '}
              {formatNumber(l.ratePerMonth * 100, 1)}% a month
              <span class="meta">Due {formatGameDate(l.dueTick).slice(0, 10)}</span>
            </span>
            <button
              type="button"
              class="action small quiet"
              onClick={() =>
                void run({ t: 'repayLoan', loanId: l.id, amountCents: l.principalCents })
              }
            >
              Repay
            </button>
          </li>
        ))}
      </ul>
      <p>
        Credit line: <span class="num">{formatMoney(f.creditDrawnCents)}</span> drawn of{' '}
        <span class="num">{formatMoney(f.creditLimitCents)}</span>.
      </p>
      <div class="order-form">
        <div class="fields">
          <label for="credit-amount">Credit amount (LM)</label>
          <input
            id="credit-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="1000"
            value={amount}
            onInput={(e) => setAmount(e.currentTarget.value)}
          />
        </div>
        <div class="buttons">
          <button
            type="button"
            class="action"
            disabled={!ok}
            onClick={() => void run({ t: 'drawCredit', amountCents: cents })}
          >
            Draw
          </button>
          <button
            type="button"
            class="action quiet"
            disabled={!ok}
            onClick={() => void run({ t: 'repayCredit', amountCents: cents })}
          >
            Repay
          </button>
        </div>
      </div>
      <ErrorText error={error} />
    </section>
  );
}

const DIVIDENDS = [
  { id: '0', label: '0%' },
  { id: '0.1', label: '10%' },
  { id: '0.25', label: '25%' },
  { id: '0.5', label: '50%' },
];

function OwnShares({ snap }: { snap: UiSnapshot }) {
  const { error, run } = useCommand();
  const [qty, setQty] = useState('1000');
  const [confirm, setConfirm] = useState<'issue' | 'buyback' | null>(null);
  const own = snap.listings.find((l) => l.companyId === PLAYER);
  if (!own) return null;
  const name = nameOf(snap);
  const shares = Number(qty);
  const ok = Number.isSafeInteger(shares) && shares > 0;
  const holders = snap.holdings.filter((h) => h.companyId === PLAYER && h.holder !== PLAYER);
  const ask =
    confirm === 'issue'
      ? `Issue ${formatNumber(shares)} new shares? Every shareholder will own a smaller part of the company.`
      : `Buy back ${formatNumber(shares)} shares at market, about ${formatMoney(shares * own.priceCents)}?`;
  return (
    <section aria-labelledby="fin-shares">
      <h3 id="fin-shares">Your shares</h3>
      <PriceChart history={own.history} label="Your share price, hour by hour" />
      <dl class="facts">
        <div>
          <dt>Price</dt>
          <dd class="num">{formatMoney(own.priceCents)}</dd>
        </div>
        <div>
          <dt>Shares outstanding</dt>
          <dd class="num">{formatNumber(own.outstanding)}</dd>
        </div>
        <div>
          <dt>Held in treasury</dt>
          <dd class="num">{formatNumber(own.treasury)}</dd>
        </div>
        <div>
          <dt>Market value</dt>
          <dd class="num">{formatMoney(own.marketCapCents)}</dd>
        </div>
      </dl>
      <h4>Holders above 1%</h4>
      <ul class="orders" aria-label="Holders">
        {holders.length === 0 && <li class="empty">No company holds more than 1%.</li>}
        {holders.map((h) => (
          <li key={h.holder}>
            <span>{name(h.holder)}</span>
            <span class="num">{formatNumber((h.shares / own.outstanding) * 100, 1)}%</span>
          </li>
        ))}
      </ul>
      <Choices
        legend="Dividend: share of each month's profit"
        name="fin-dividend"
        options={DIVIDENDS}
        value={String(snap.finance?.dividendRatio ?? 0)}
        onChange={(v) => void run({ t: 'setDividendRatio', ratio: Number(v) })}
      />
      <div class="order-form">
        <div class="fields">
          <label for="own-qty">Shares to buy back or issue</label>
          <input
            id="own-qty"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={qty}
            onInput={(e) => setQty(e.currentTarget.value)}
          />
        </div>
        {confirm === null ? (
          <div class="buttons">
            <button
              type="button"
              class="action"
              disabled={!ok}
              onClick={() => setConfirm('buyback')}
            >
              Buy back
            </button>
            <button type="button" class="action" disabled={!ok} onClick={() => setConfirm('issue')}>
              Issue shares
            </button>
          </div>
        ) : (
          <div class="confirm" role="group" aria-label="Confirm">
            <p>{ask}</p>
            <div class="buttons">
              <button
                type="button"
                class="action"
                onClick={() => {
                  setConfirm(null);
                  void run(
                    confirm === 'issue'
                      ? { t: 'issueShares', qty: shares }
                      : {
                          t: 'placeShareOrder',
                          target: PLAYER,
                          side: 'buy',
                          kind: 'market',
                          qty: shares,
                        },
                  );
                }}
              >
                {confirm === 'issue' ? 'Issue' : 'Buy back'}
              </button>
              <button type="button" class="action quiet" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <ErrorText error={error} />
    </section>
  );
}

function Stocks({ snap }: { snap: UiSnapshot }) {
  const { error, run } = useCommand();
  const [chosen, setChosen] = useState<CompanyId | null>(null);
  const name = nameOf(snap);
  const rivals = snap.listings.filter((l) => l.companyId !== PLAYER);
  const held = (id: CompanyId) =>
    snap.holdings.find((h) => h.holder === PLAYER && h.companyId === id)?.shares ?? 0;
  const pick = rivals.find((l) => l.companyId === chosen);
  return (
    <section aria-labelledby="fin-stocks">
      <h3 id="fin-stocks">Stocks</h3>
      <table class="goods-table" aria-label="Stocks">
        <thead>
          <tr>
            <th scope="col">Company</th>
            <th scope="col">LM/share</th>
            <th scope="col">24 h</th>
            <th scope="col">P/E</th>
            <th scope="col">Rating</th>
          </tr>
        </thead>
        <tbody>
          {rivals.map((l) => (
            <tr key={l.companyId}>
              <th scope="row">
                <button
                  type="button"
                  aria-pressed={chosen === l.companyId}
                  onClick={() => setChosen(l.companyId)}
                >
                  {name(l.companyId)}
                </button>
              </th>
              <td class="num">{formatNumber(l.priceCents / 100, 2)}</td>
              <td class="num">
                <Trend history={l.history} /> {formatChange(l.change24h)}
              </td>
              <td class="num">{ratio(l.pe, 1)}</td>
              <td>{snap.companies.find((c) => c.id === l.companyId)?.rating ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pick && (
        <>
          <ShareOrderForm
            key={pick.companyId}
            target={pick.companyId}
            name={name(pick.companyId)}
            run={run}
          />
          <p>
            {held(pick.companyId) > 0
              ? `You hold ${formatNumber(held(pick.companyId))} shares.`
              : 'You hold no shares.'}
          </p>
        </>
      )}
      {snap.shareOrders.length > 0 && (
        <ul class="orders" aria-label="Open share orders">
          {snap.shareOrders.map((o) => (
            <li key={o.id}>
              <span>
                {o.side === 'buy' ? 'Buy' : 'Sell'} {formatNumber(o.qty - o.filled)}{' '}
                {o.target === PLAYER ? 'own' : name(o.target)} shares
                <span class="meta">
                  {o.kind === 'market' ? 'at market' : `limit ${formatMoney(o.limitCents ?? 0)}`}
                </span>
              </span>
              <button
                type="button"
                class="action small quiet"
                onClick={() => void run({ t: 'cancelShareOrder', orderId: o.id })}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={error} />
    </section>
  );
}

/** Phones have no ticker: the latest news reads here. */
function News({ snap }: { snap: UiSnapshot }) {
  const name = nameOf(snap);
  return (
    <section aria-labelledby="fin-news">
      <h3 id="fin-news">News</h3>
      <ul class="orders" aria-label="News">
        {snap.news.length === 0 && <li class="empty">No news yet.</li>}
        {snap.news.slice(0, 10).map((n, i) => (
          <li key={`${n.tick}-${i}`}>
            <span>
              {newsText(n, name)}
              <span class="meta">{formatGameDate(n.tick)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Statements, ratios, loans, the company's own shares and everyone else's. */
export function FinanceTab() {
  const snap = ui.value;
  const f = snap?.finance;
  if (!snap?.company || !f) return <p>{ERROR_COPY.NOT_FOUNDED}</p>;
  return (
    <div class="finance-tab">
      <Statements f={f} />
      <Ratios f={f} />
      <Debt f={f} />
      <OwnShares snap={snap} />
      <Stocks snap={snap} />
      {!isDesktop.value && <News snap={snap} />}
    </div>
  );
}

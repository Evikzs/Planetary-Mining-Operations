import { useState } from 'preact/hooks';
import type { Command } from '../../sim/commands';
import type { CompanyId } from '../../sim/companies';
import { Choices } from './Choices';

type Side = 'buy' | 'sell';
type Kind = 'market' | 'limit';
const SIDES: { id: Side; label: string }[] = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
];
const KINDS: { id: Kind; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
];

/** An order for one company's shares: side, market or limit, how many, and the limit price. */
export function ShareOrderForm(props: {
  target: CompanyId;
  name: string;
  run: (cmd: Command) => Promise<boolean>;
}) {
  const { target, name, run } = props;
  const [side, setSide] = useState<Side>('buy');
  const [kind, setKind] = useState<Kind>('market');
  const [qty, setQty] = useState('100');
  const [limit, setLimit] = useState('');
  const shares = Number(qty);
  const limitCents = Math.round(Number(limit) * 100);
  const ok =
    Number.isSafeInteger(shares) &&
    shares > 0 &&
    (kind === 'market' || (Number.isSafeInteger(limitCents) && limitCents > 0));
  return (
    <form
      class="order-form"
      aria-label={`Trade ${name} shares`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void run({
          t: 'placeShareOrder',
          target,
          side,
          kind,
          qty: shares,
          limitCents: kind === 'limit' ? limitCents : undefined,
        });
      }}
    >
      <Choices legend="Side" name="share-side" options={SIDES} value={side} onChange={setSide} />
      <Choices legend="Order" name="share-kind" options={KINDS} value={kind} onChange={setKind} />
      <div class="fields">
        <label for="share-qty">Shares</label>
        <input
          id="share-qty"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={qty}
          onInput={(e) => setQty(e.currentTarget.value)}
        />
        {kind === 'limit' && (
          <>
            <label for="share-limit">Limit price (LM)</label>
            <input
              id="share-limit"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={limit}
              onInput={(e) => setLimit(e.currentTarget.value)}
            />
          </>
        )}
      </div>
      <button type="submit" class="action" disabled={!ok}>
        Place order
      </button>
    </form>
  );
}

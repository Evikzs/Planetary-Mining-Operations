import { useState } from 'preact/hooks';
import type { Command } from '../../sim/commands';
import { loanRate } from '../../sim/finance/credit';
import type { FinanceView } from '../../sim/views';
import { formatMoney } from '../format';
import { Choices } from './Choices';

type Term = '3' | '6' | '12';
const TERMS: { id: Term; label: string }[] = [
  { id: '3', label: '3 months' },
  { id: '6', label: '6 months' },
  { id: '12', label: '12 months' },
];

/** A loan at today's rating: amount, term, the monthly rate and the room left to borrow. */
export function LoanForm(props: { finance: FinanceView; run: (cmd: Command) => Promise<boolean> }) {
  const { finance, run } = props;
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState<Term>('6');
  const cents = Math.round(Number(amount) * 100);
  const rate = loanRate(finance.rating);
  const ok = rate !== null && Number.isSafeInteger(cents) && cents > 0;
  return (
    <form
      class="order-form"
      aria-label="Take a loan"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        const months = Number(term) as 3 | 6 | 12;
        void run({ t: 'takeLoan', amountCents: cents, months }).then((done) => {
          if (done) setAmount('');
        });
      }}
    >
      <div class="fields">
        <label for="loan-amount">Loan amount (LM)</label>
        <input
          id="loan-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="1000"
          value={amount}
          onInput={(e) => setAmount(e.currentTarget.value)}
        />
      </div>
      <Choices legend="Term" name="loan-term" options={TERMS} value={term} onChange={setTerm} />
      <p class="meta">
        {rate === null
          ? 'Lenders give no credit at rating D.'
          : `${(rate * 100).toFixed(1)}% a month at rating ${finance.rating}. You can borrow up to ${formatMoney(finance.borrowingRoomCents)} more.`}
      </p>
      <button type="submit" class="action" disabled={!ok}>
        Take loan
      </button>
    </form>
  );
}

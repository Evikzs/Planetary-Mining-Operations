import { formatMoney } from '../format';
import { ErrorText, useCommand } from './command';

/** The land office's offer for one section. */
export function BuySection({ id, priceCents }: { id: number; priceCents: number }) {
  const { error, run } = useCommand();
  return (
    <>
      <button
        type="button"
        class="action"
        onClick={() => void run({ t: 'buySection', sectionId: id })}
      >
        Buy section — {formatMoney(priceCents)}
      </button>
      <ErrorText error={error} />
    </>
  );
}

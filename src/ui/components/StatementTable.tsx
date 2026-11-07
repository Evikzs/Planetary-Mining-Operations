import { formatMoney } from '../format';

export interface StatementRow {
  label: string;
  cents: number;
  /** A total, set in bold. */
  strong?: boolean;
}

/** One statement: a line per account, amounts in tabular figures. */
export function StatementTable({ caption, rows }: { caption: string; rows: StatementRow[] }) {
  return (
    <table class="goods-table statement">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} class={r.strong ? 'strong' : undefined}>
            <th scope="row">{r.label}</th>
            <td class="num">{formatMoney(r.cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import { ui } from '../../client/store';
import { newsText } from '../../data/copy';
import { nameOf } from '../tabs/FinanceTab';

const SHOWN = 3;

/**
 * The shift log: the three newest pieces of news, oldest on top, the newest brightest at the foot.
 * A new line slides in; lines already shown keep their place (keyed), so only the new one moves.
 */
export function NewsTicker() {
  const snap = ui.value;
  const lines = snap ? snap.news.slice(0, SHOWN).map((n) => newsText(n, nameOf(snap))) : [];
  const seen = new Map<string, number>();
  const keyed = lines.reverse().map((text) => {
    const n = (seen.get(text) ?? 0) + 1;
    seen.set(text, n);
    return { text, key: `${text}#${n}` };
  });
  return (
    <div class="ticker" data-testid="news-ticker" role="log" aria-label="News">
      <ul>
        {keyed.map((l) => (
          <li key={l.key} class="fresh">
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

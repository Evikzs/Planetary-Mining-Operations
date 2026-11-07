import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { reducedMotion, ui } from '../../client/store';
import { newsText } from '../../data/copy';
import type { UiSnapshot } from '../../sim/views';
import { nameOf } from '../tabs/FinanceTab';

const CRAWL_PX_PER_S = 60;
const STILL_MS = 8000;

const textsOf = (snap: UiSnapshot) => snap.news.map((n) => newsText(n, nameOf(snap)));

/**
 * Desktop news, newest first: a crawl from right to left that stops while hovered or focused.
 * In reduced motion, one item at a time, the next every 8 seconds, without movement.
 */
export function NewsTicker() {
  const snap = ui.value;
  const reduced = reducedMotion.value;
  const [current, setCurrent] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const texts = snap ? textsOf(snap) : [];
  const key = texts.join('\n');
  // The item on show stays put as news lands; every 8 seconds the next older one takes over.
  const first = texts[0];
  useEffect(() => {
    if (reduced && current === null && first !== undefined) setCurrent(first);
  }, [reduced, current, first]);
  useEffect(() => {
    if (!reduced) return;
    const id = setInterval(() => {
      const all = ui.value ? textsOf(ui.value) : [];
      setCurrent((c) => all[(Math.max(0, all.indexOf(c ?? '')) + 1) % all.length] ?? null);
    }, STILL_MS);
    return () => clearInterval(id);
  }, [reduced]);
  // The track starts one ticker width to the right, so it crosses its own width at 60 px/s.
  useLayoutEffect(() => {
    if (!reduced && track.current) setSeconds(track.current.scrollWidth / CRAWL_PX_PER_S);
  }, [key, reduced]);
  const still = current !== null && texts.includes(current) ? current : first;
  const shown = reduced ? (still === undefined ? [] : [still]) : texts;
  return (
    <div class="ticker" data-testid="news-ticker" role="marquee" aria-label="News" tabIndex={0}>
      <ul
        key={reduced ? 'still' : key}
        ref={track}
        class={reduced ? 'still' : 'crawl'}
        style={!reduced && seconds ? { animationDuration: `${seconds}s` } : undefined}
      >
        {shown.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </div>
  );
}

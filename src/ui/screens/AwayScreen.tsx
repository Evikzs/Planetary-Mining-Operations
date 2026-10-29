import { useEffect, useRef } from 'preact/hooks';
import { away, ui, world } from '../../client/store';
import { alertText } from '../../data/copy';
import { GOODS, type GoodId } from '../../data/goods';
import { formatGameDuration, formatMass, formatMoney } from '../format';
import { namesIn } from '../shell/Alerts';
import { awayHeadline } from './awayHeadline';

/** The three goods with the most mass, as '30.0 t Ilmenite, 5.00 t Steel'. */
function topGoods(kg: Partial<Record<GoodId, number>>): string {
  const rows = (Object.entries(kg) as [GoodId, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  return rows.length
    ? rows.map(([g, n]) => `${formatMass(n)} ${GOODS[g].name}`).join(', ')
    : 'Nothing';
}

/** 'While you were away': a one-page newspaper poster of what happened during catch-up. */
export function AwayScreen() {
  const s = away.value;
  const snap = ui.value;
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus(), [s]);
  if (!s || !snap) return null;
  const names = namesIn(world.value);
  const cash = s.cashDeltaCents;
  return (
    <div class="away-backdrop">
      <article class="away card" role="dialog" aria-modal="true" aria-labelledby="away-title">
        <div class="body">
          <header class="masthead">
            <h1 id="away-title">While you were away</h1>
            <p class="dateline">
              {snap.company?.name}, {snap.date}
            </p>
          </header>
          <h2 class="headline">{awayHeadline(s, snap.cashCents)}</h2>
          <dl class="away-stats">
            <div>
              <dt>You were away</dt>
              <dd>{formatGameDuration(s.realMsAway / 60_000)}</dd>
            </div>
            <div>
              <dt>Game time run</dt>
              <dd>{formatGameDuration(s.gameHours * 60)}</dd>
            </div>
            <div>
              <dt>Cash</dt>
              <dd class="num">{(cash > 0 ? '+' : '') + formatMoney(cash)}</dd>
            </div>
            <div>
              <dt>Contracts</dt>
              <dd>
                {s.contractsCompleted} done, {s.contractsFailed} failed
              </dd>
            </div>
            <div class="wide">
              <dt>Made</dt>
              <dd>{topGoods(s.producedKg)}</dd>
            </div>
            <div class="wide">
              <dt>Sold</dt>
              <dd>{topGoods(s.soldKg)}</dd>
            </div>
            <div class="wide">
              <dt>People</dt>
              <dd>
                {s.arrivals} arrived, {s.departures} left
              </dd>
            </div>
          </dl>
          <p class="meta">
            Crews worked skeleton shifts, so output ran at half rate.
            {s.capped && ' After 8 hours the Moon waited for you.'}
          </p>
          {s.alerts.length > 0 && (
            <section aria-labelledby="away-alerts">
              <h3 id="away-alerts">Needs your attention</h3>
              <ul>
                {s.alerts.map((a, i) => (
                  <li key={i}>{alertText(a, names)}</li>
                ))}
              </ul>
            </section>
          )}
          <button ref={back} type="button" class="action" onClick={() => (away.value = null)}>
            Back to work
          </button>
        </div>
      </article>
    </div>
  );
}

import { catchUpProgress } from '../../client/store';

/** A progress bar while the worker runs the time the player was away. */
export function CatchUpOverlay() {
  const p = catchUpProgress.value;
  if (p === null) return null;
  const pct = Math.round(p * 100);
  return (
    <div class="catch-up card" role="status">
      <p>Catching up on the time you were away</p>
      <div
        class="bar"
        role="progressbar"
        aria-label="Catch-up"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

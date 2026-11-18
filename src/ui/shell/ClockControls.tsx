import { clock, simClient } from '../../client/store';
import type { Speed } from '../../worker/protocol';

export const SPEEDS: Speed[] = [1, 2, 4, 8];

/** Sets the clock; picking a speed also resumes it. */
export function setClock(paused: boolean, speed: Speed = clock.value.speed): void {
  simClient.value?.post({ t: 'setClock', paused, speed });
}

export const togglePause = (): void => setClock(!clock.value.paused);

/** Pause and the four speeds; the top bar's clock shows the "Paused" stamp and the real speed. */
export function ClockControls() {
  const c = clock.value;
  return (
    <span class="clock-controls">
      <button
        type="button"
        class="speed"
        aria-pressed={c.paused}
        data-tip={`${c.paused ? 'Resume' : 'Pause'} (Space)`}
        onClick={togglePause}
      >
        {c.paused ? 'Resume' : 'Pause'}
      </button>
      {SPEEDS.map((s, i) => (
        <button
          key={s}
          type="button"
          class="speed"
          aria-pressed={!c.paused && c.speed === s}
          data-tip={`Speed ${s}× (${i + 1})`}
          onClick={() => setClock(false, s)}
        >
          {s}×
        </button>
      ))}
    </span>
  );
}

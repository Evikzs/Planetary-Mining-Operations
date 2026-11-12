import { clock, simClient } from '../../client/store';
import type { Speed } from '../../worker/protocol';

export const SPEEDS: Speed[] = [1, 2, 4, 8];

/** Sets the clock; picking a speed also resumes it. */
export function setClock(paused: boolean, speed: Speed = clock.value.speed): void {
  simClient.value?.post({ t: 'setClock', paused, speed });
}

export const togglePause = (): void => setClock(!clock.value.paused);

/** Pause, the four speeds and, when the machine falls behind, the speed it really keeps. */
export function ClockControls() {
  const c = clock.value;
  const slow = !c.paused && c.actualSpeed < 0.9 * c.speed;
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
      {c.paused && (
        <span class="stamp" data-testid="paused">
          Paused
        </span>
      )}
      {slow && (
        <span class="meta" data-testid="real-speed">
          Running at {c.actualSpeed.toFixed(1)}×
        </span>
      )}
    </span>
  );
}

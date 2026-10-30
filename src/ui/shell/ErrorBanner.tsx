import { workerError } from '../../client/store';

/** What went wrong in the game worker, in its own words, until the player dismisses it. */
export function ErrorBanner() {
  const message = workerError.value;
  if (!message) return null;
  return (
    <div class="error-banner card" role="alert">
      <p>{message}</p>
      <button type="button" class="action small quiet" onClick={() => (workerError.value = null)}>
        Dismiss
      </button>
    </div>
  );
}

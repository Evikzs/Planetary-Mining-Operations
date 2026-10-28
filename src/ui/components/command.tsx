import { useState } from 'preact/hooks';
import { simClient } from '../../client/store';
import { ERROR_COPY } from '../../data/copy';
import type { Command } from '../../sim/commands';

/** Sends commands; keeps the last failure as plain text for an aria-live line. */
export function useCommand() {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    clear: () => setError(null),
    run: async (cmd: Command): Promise<boolean> => {
      const result = await simClient.value?.send(cmd);
      if (!result) return false;
      setError(result.ok ? null : ERROR_COPY[result.error]);
      return result.ok;
    },
  };
}

export function ErrorText({ error }: { error: string | null }) {
  return (
    <p class="error" aria-live="polite">
      {error}
    </p>
  );
}

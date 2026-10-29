import { useEffect, useId, useState } from 'preact/hooks';
import { simClient } from '../../client/store';
import { formatGameDate } from '../../sim/clock';
import type { ManualSlot, SaveSlot } from '../../worker/protocol';
import { ErrorText } from './command';

const SLOTS: ManualSlot[] = [1, 2, 3, 4, 5];

/** The five manual save slots. With `canSave` each can take the game now, and loading asks first. */
export function SaveSlots({ canSave }: { canSave: boolean }) {
  const [slots, setSlots] = useState<SaveSlot[] | null>(null);
  const [asking, setAsking] = useState<ManualSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void simClient.value?.listSaves().then(setSlots);
  }, []);

  const save = async (slot: ManualSlot) => {
    const res = await simClient.value?.manualSave(slot);
    if (!res) return;
    setSlots(res.slots);
    setError(res.error ?? null);
  };
  const load = async (slot: ManualSlot) => {
    setAsking(null);
    const res = await simClient.value?.manualLoad(slot);
    setError(res && !res.ok ? (res.error ?? null) : null);
  };

  return (
    <div class="save-slots">
      {SLOTS.map((n) => {
        const s = slots?.find((x) => x.slot === n);
        const what = s ? `${s.company || 'No company'}, ${formatGameDate(s.tick)}` : 'Empty';
        return (
          <div key={n} class="save-slot" role="group" aria-label={`Slot ${n}`}>
            <p>
              <span class="slot-name">Slot {n}</span> <span class="meta">{slots ? what : ''}</span>
            </p>
            {asking === n ? (
              <div class="confirm">
                <p>Load slot {n}? It replaces your current company.</p>
                <button type="button" class="action small danger" onClick={() => void load(n)}>
                  Load
                </button>{' '}
                <button type="button" class="action small quiet" onClick={() => setAsking(null)}>
                  Keep playing
                </button>
              </div>
            ) : (
              <div class="slot-actions">
                {canSave && (
                  <button type="button" class="action small quiet" onClick={() => void save(n)}>
                    Save
                  </button>
                )}
                <button
                  type="button"
                  class="action small quiet"
                  disabled={!s}
                  onClick={() => (canSave ? setAsking(n) : void load(n))}
                >
                  Load
                </button>
              </div>
            )}
          </div>
        );
      })}
      <ErrorText error={error} />
    </div>
  );
}

/** Takes a 'PMO1.' save code, as Settings exports it, and plays that game. */
export function ImportSave() {
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    const res = await simClient.value?.importSave(code.trim());
    setError(res && !res.ok ? (res.error ?? null) : null);
  };
  return (
    <form
      class="import-save"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <label for={id}>Paste a save code</label>
      <textarea
        id={id}
        rows={3}
        spellcheck={false}
        value={code}
        onInput={(e) => setCode(e.currentTarget.value)}
      />
      <button type="submit" class="action small" disabled={!code.trim()}>
        Import
      </button>
      <ErrorText error={error} />
    </form>
  );
}

import { useState } from 'preact/hooks';
import { flyHome, simClient, world } from '../../client/store';
import { ERROR_COPY } from '../../data/copy';
import { isValidCompanyName } from '../../sim/commands';
import type { CompanionId } from '../../sim/state';
import { ErrorText, useCommand } from '../components/command';
import { ImportSave, SaveSlots } from '../components/SaveControls';
import veteranPortrait from '../companion/portraits/veteran.svg';

const COMPANIONS: { id: CompanionId; name: string; about: string }[] = [
  { id: 'veteran', name: 'Ox Varga', about: 'Old Belt miner. Dry humour, blunt advice.' },
  { id: 'shipAi', name: 'Ship AI', about: 'Arrives in a later update.' },
  { id: 'coFounder', name: 'Ambitious co-founder', about: 'Arrives in a later update.' },
  { id: 'pirate', name: 'Redhead pirate', about: 'Arrives in a later update.' },
];

const MAX_SEED = 0xffff_ffff;

/** A world seed typed by the player, or null when it is not a whole number in range. */
function parseSeed(text: string): number | null {
  const t = text.trim();
  return /^\d{1,10}$/.test(t) && Number(t) <= MAX_SEED ? Number(t) : null;
}

/** The first screen of a new game: name the company, meet the companion, take the charter. */
export function FoundingScreen() {
  const { error, run } = useCommand();
  const [name, setName] = useState('');
  const [seedText, setSeedText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const worldSeed = world.value?.seed;
  const valid = isValidCompanyName(name);
  const seed = seedText === null ? worldSeed : parseSeed(seedText);
  const canFound = valid && seed !== null && !busy;

  const found = async () => {
    if (!canFound) return;
    setBusy(true);
    // A different seed means a different Moon: start that world first, then found on it.
    if (seed !== undefined && seed !== worldSeed) simClient.value?.post({ t: 'newGame', seed });
    const ok = await run({ t: 'foundCompany', name: name.trim(), companionId: 'veteran' });
    if (ok) flyHome.value = true;
    else setBusy(false);
  };

  return (
    <div class="founding" role="dialog" aria-modal="true" aria-labelledby="founding-title">
      <div class="founding-card card">
        <div class="body">
          <p class="wordmark">Planetary Mining Operations</p>
          <h1 id="founding-title">Found your company</h1>
          <p class="lede">
            The Lunar Authority grants you a charter: one section near the south pole, LM 250,000
            and a crew of 33.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void found();
            }}
          >
            <label class="field-label" for="company-name">
              Company name
            </label>
            <input
              id="company-name"
              class="text-input"
              value={name}
              maxLength={32}
              autoComplete="off"
              aria-invalid={name !== '' && !valid}
              aria-describedby="company-name-error"
              onInput={(e) => setName(e.currentTarget.value)}
            />
            <p id="company-name-error" class="error" aria-live="polite">
              {name !== '' && !valid ? ERROR_COPY.INVALID_NAME : ''}
            </p>
            <fieldset class="companions">
              <legend>Your operations chief</legend>
              {COMPANIONS.map((c) => (
                <label key={c.id} class="companion-card">
                  <input
                    type="radio"
                    name="companion"
                    value={c.id}
                    checked={c.id === 'veteran'}
                    disabled={c.id !== 'veteran'}
                  />
                  {c.id === 'veteran' ? (
                    <img src={veteranPortrait} alt="" width={56} height={56} />
                  ) : (
                    <span class="portrait-blank" aria-hidden="true" />
                  )}
                  <span class="who">
                    <strong>{c.name}</strong>
                    <span class="meta">{c.about}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <details class="disclosure">
              <summary>Advanced</summary>
              <label class="field-label" for="world-seed">
                World seed
              </label>
              <input
                id="world-seed"
                class="text-input"
                inputMode="numeric"
                autoComplete="off"
                value={seedText ?? String(worldSeed ?? '')}
                aria-describedby="world-seed-note"
                onInput={(e) => setSeedText(e.currentTarget.value)}
              />
              <p id="world-seed-note" class={seed === null ? 'error' : 'meta'}>
                {seed === null
                  ? 'Use a whole number from 0 to 4,294,967,295.'
                  : 'The same seed always gives the same Moon.'}
              </p>
            </details>
            <ErrorText error={error} />
            <button type="submit" class="action" disabled={!canFound}>
              Found company
            </button>
          </form>
          <details class="disclosure">
            <summary>Load a save</summary>
            <SaveSlots canSave={false} />
            <ImportSave />
          </details>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'preact/hooks';
import { loadOfflinePref, saveMotionPref, saveOfflinePref } from '../../client/preferences';
import { motionPref, simClient, ui, type MotionPref } from '../../client/store';
import { ERROR_COPY } from '../../data/copy';
import type { HintCategory } from '../../sim/story/beats';
import { Choices } from '../components/Choices';
import { ErrorText, useCommand } from '../components/command';
import { ImportSave, SaveSlots } from '../components/SaveControls';
import { activeTab, OTHER_KEYS, TABS } from '../shell/tabs';

const MOTION: { id: MotionPref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
];
const HINTS: { id: HintCategory; label: string }[] = [
  { id: 'tutorial', label: 'Tutorial hints' },
  { id: 'economy', label: 'Economy hints' },
  { id: 'alerts', label: 'Alert hints' },
];

function ExportSave() {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => setCopied('Copied.'),
      () => setCopied('Select the code and copy it.'),
    );
  return (
    <div class="export-save">
      <button
        type="button"
        class="action small quiet"
        onClick={() => void simClient.value?.exportSave().then(setCode)}
      >
        Export save
      </button>
      {code && (
        <>
          <label for="export-code">Your save code</label>
          <textarea
            id="export-code"
            rows={3}
            readOnly
            value={code}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" class="action small" onClick={() => void copy(code)}>
            Copy
          </button>
          <p class="meta" aria-live="polite">
            {copied}
          </p>
        </>
      )}
    </div>
  );
}

function NewGame() {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" class="action small quiet" onClick={() => setAsking(true)}>
        New game
      </button>
    );
  }
  const start = () => {
    activeTab.value = null;
    const [seed = 0] = crypto.getRandomValues(new Uint32Array(1));
    simClient.value?.post({ t: 'newGame', seed });
  };
  return (
    <div class="confirm">
      <p>This replaces your current company. Export first if you want to keep it.</p>
      <button type="button" class="action small danger" onClick={start}>
        Start a new game
      </button>{' '}
      <button type="button" class="action small quiet" onClick={() => setAsking(false)}>
        Keep playing
      </button>
    </div>
  );
}

/** Whether the world runs while the game is closed; the worker learns of a change at once. */
function OfflineChoice() {
  const [on, setOn] = useState(loadOfflinePref);
  return (
    <section aria-labelledby="settings-clock">
      <h3 id="settings-clock">Clock</h3>
      <label class="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            setOn(next);
            saveOfflinePref(next);
            simClient.value?.post({ t: 'setPrefs', prefs: { offlineCatchUp: next } });
          }}
        />
        Run the world while closed
      </label>
      <p class="meta">
        When on, a game that was running when you closed it catches up when you return: up to 8 game
        hours, your own work at half rate.
      </p>
    </section>
  );
}

const KEY_ROWS: [string, string][] = [
  ...TABS.map((t): [string, string] => [t.key.toUpperCase(), t.label]),
  ...OTHER_KEYS,
];

function KeyList() {
  return (
    <section aria-labelledby="settings-keys">
      <h3 id="settings-keys">Keys</h3>
      <table class="goods-table" aria-label="Keys">
        <tbody>
          {KEY_ROWS.map(([key, action]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Motion, the clock, companion hints, keys, saves, export and import, and a fresh start. */
export function SettingsTab() {
  const { error, run } = useCommand();
  const snap = ui.value;
  if (!snap?.company) return <p>{ERROR_COPY.NOT_FOUNDED}</p>;
  const muted = snap.story.muted;
  return (
    <div class="settings-tab">
      <section>
        <Choices
          legend="Reduced motion"
          name="reduced-motion"
          options={MOTION}
          value={motionPref.value}
          onChange={(pref) => {
            motionPref.value = pref;
            saveMotionPref(pref);
          }}
        />
        <p class="meta">System follows the setting on your device.</p>
      </section>
      <section>
        <fieldset class="field-set">
          <legend>Companion hints</legend>
          {HINTS.map((h) => (
            <label key={h.id} class="check">
              <input
                type="checkbox"
                checked={!muted.includes(h.id)}
                onChange={(e) =>
                  void run({ t: 'setHintMute', category: h.id, muted: !e.currentTarget.checked })
                }
              />
              {h.label}
            </label>
          ))}
        </fieldset>
      </section>
      <OfflineChoice />
      <KeyList />
      <section aria-labelledby="settings-saves">
        <h3 id="settings-saves">Saved games</h3>
        <p class="meta">The game also saves itself every 30 seconds.</p>
        <SaveSlots canSave />
      </section>
      <section aria-labelledby="settings-transfer">
        <h3 id="settings-transfer">Move a game</h3>
        <p class="meta">Export a code here and import it on another device.</p>
        <ExportSave />
        <ImportSave confirm />
      </section>
      <section aria-labelledby="settings-new">
        <h3 id="settings-new">Start over</h3>
        <NewGame />
      </section>
      <ErrorText error={error} />
    </div>
  );
}

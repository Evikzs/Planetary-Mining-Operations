import { useState } from 'preact/hooks';
import { codexFocus, companionOpen, simClient, ui } from '../../client/store';
import { BEATS } from '../../sim/story/beats';
import type { UiSnapshot } from '../../sim/views';
import { moreOpen } from '../shell/BottomTabs';
import { Sheet } from '../shell/Sheet';
import { activeTab } from '../shell/tabs';
import veteranPortrait from './portraits/veteran.svg';

type Line = NonNullable<UiSnapshot['story']['line']>;

function openCodex(line: Line | null): void {
  codexFocus.value = line ? (BEATS[line.beatId].codex[0] ?? null) : null;
  companionOpen.value = false;
  moreOpen.value = false;
  activeTab.value = 'codex';
}

/** One beat, a line at a time; Next on the last line closes the beat. */
function Speech({ line }: { line: Line }) {
  const [i, setI] = useState(0);
  const last = i >= line.lines.length - 1;
  const next = () => {
    if (!last) return setI(i + 1);
    companionOpen.value = false;
    void simClient.value?.send({ t: 'storyAck', beatId: line.beatId });
  };
  return (
    <>
      <p class="line">{line.lines[i]}</p>
      <div class="speech-actions">
        <button type="button" class="action small" onClick={next}>
          Next
        </button>
        <button type="button" class="action small quiet" onClick={() => openCodex(line)}>
          Open Codex
        </button>
        <span class="meta">
          {i + 1} of {line.lines.length}
        </span>
      </div>
    </>
  );
}

/** Ox Varga: a portrait with his current line on desktop; on phones, a portrait that opens it. */
export function CompanionBubble({ desktop }: { desktop: boolean }) {
  const line = ui.value?.story.line ?? null;
  if (desktop) {
    return (
      <aside class="companion" data-testid="companion" aria-label="Ox Varga">
        <img class="portrait" src={veteranPortrait} alt="" width={88} height={88} />
        <div class="speech-slot" aria-live="polite">
          {line && (
            <div class="speech card">
              <p class="speaker">{line.speaker}</p>
              <Speech key={line.beatId} line={line} />
            </div>
          )}
        </div>
      </aside>
    );
  }
  return (
    <>
      <button
        type="button"
        class="companion portrait-button"
        data-testid="companion"
        aria-label={line ? 'Talk to Ox Varga, he has news' : 'Talk to Ox Varga'}
        aria-expanded={companionOpen.value}
        onClick={() => {
          activeTab.value = null;
          moreOpen.value = false;
          companionOpen.value = !companionOpen.value;
        }}
      >
        <img src={veteranPortrait} alt="" width={56} height={56} />
        {line && <span class="badge" />}
      </button>
      {companionOpen.value && (
        <Sheet title={line?.speaker ?? 'Ox Varga'} onClose={() => (companionOpen.value = false)}>
          <div class="sheet-speech">
            <img src={veteranPortrait} alt="" width={64} height={64} />
            <div>
              {line ? (
                <Speech key={line.beatId} line={line} />
              ) : (
                <>
                  <p class="line">No news right now.</p>
                  <button type="button" class="action small quiet" onClick={() => openCodex(null)}>
                    Open Codex
                  </button>
                </>
              )}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

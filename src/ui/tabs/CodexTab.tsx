import { useEffect, useRef, useState } from 'preact/hooks';
import { codexFocus, ui } from '../../client/store';
import { CODEX, type CodexCategory } from '../../data/codex';
import { ERROR_COPY } from '../../data/copy';
import { codexFacts } from './codexFacts';

const CATEGORY_NAME: Record<CodexCategory, string> = {
  goods: 'Goods',
  buildings: 'Buildings',
  contracts: 'Contracts',
  mechanics: 'Mechanics',
  concepts: 'Concepts',
};
const CATEGORIES = Object.keys(CATEGORY_NAME) as CodexCategory[];
const TOTAL = Object.keys(CODEX).length;

function Entry({ id }: { id: string }) {
  const entry = CODEX[id];
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const reduced = document.documentElement.dataset.motion === 'reduced';
    ref.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [id]);
  if (!entry) return null;
  const facts = codexFacts(id);
  return (
    <article class="codex-entry" ref={ref} aria-labelledby="codex-entry-title">
      <p class="meta">{CATEGORY_NAME[entry.category]}</p>
      <h3 id="codex-entry-title">{entry.title}</h3>
      <p>{entry.body}</p>
      {entry.realWorld && (
        <p class="real-world">
          <strong>On Earth.</strong> {entry.realWorld}
        </p>
      )}
      {facts.length > 0 && (
        <dl class="facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

/** The wiki: every entry the player has met, by category and search. */
export function CodexTab() {
  const snap = ui.value;
  const [category, setCategory] = useState<CodexCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const unlocked = snap?.story.codex ?? [];
  const focus = codexFocus.value;
  // The companion points at an entry: open it if the player has met it.
  useEffect(() => {
    if (!focus) return;
    if (unlocked.includes(focus)) setOpen(focus);
    codexFocus.value = null;
  }, [focus, unlocked]);
  if (!snap?.company) return <p>{ERROR_COPY.NOT_FOUNDED}</p>;

  const q = query.trim().toLowerCase();
  const entries = unlocked
    .filter((id) => {
      const e = CODEX[id];
      if (!e || (category !== 'all' && e.category !== category)) return false;
      return !q || e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q);
    })
    .sort((a, b) => CODEX[a]!.title.localeCompare(CODEX[b]!.title));

  return (
    <div class="codex-tab">
      {open && <Entry key={open} id={open} />}
      <div class="codex-filters">
        <label class="field">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.currentTarget.value as CodexCategory | 'all')}
          >
            <option value="all">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_NAME[c]}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          Search
          <input
            type="search"
            class="text-input"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </label>
      </div>
      <p class="meta">
        {unlocked.length} of {TOTAL} entries open. More open as you meet new things.
      </p>
      <ul class="codex-list" aria-label="Codex entries">
        {entries.length === 0 && <li class="empty">No entries match.</li>}
        {entries.map((id) => (
          <li key={id}>
            <button type="button" aria-pressed={open === id} onClick={() => setOpen(id)}>
              {CODEX[id]!.title}
              <span class="meta">{CATEGORY_NAME[CODEX[id]!.category]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'preact/hooks';
import { simClient, ui, world } from '../../client/store';
import { WAGE_CENTS_PER_DAY, WAGE_LEVEL, type WageLevel } from '../../data/balance';
import { BUILDINGS, SKILLS, type Skill } from '../../data/buildings';
import { ERROR_COPY, SKILL_NAME, SKILL_NAMES } from '../../data/copy';
import type { MoraleBand, PeopleFilter, PeopleRow, UiSnapshot } from '../../sim/views';
import { ErrorText, useCommand } from '../components/command';
import { VirtualList } from '../components/VirtualList';
import { formatMoney } from '../format';
import { Icon } from '../icons';

const ROW_HEIGHT = 48;
/** Shifts by their start time. */
const SHIFT_NAMES = ['06:00', '14:00', '22:00'] as const;
const SHIFTS = [0, 1, 2] as const;
const WAGE_LEVELS: WageLevel[] = ['low', 'standard', 'high'];
const WAGE_NAMES: Record<WageLevel, string> = { low: 'Low', standard: 'Standard', high: 'High' };
const BANDS: { id: MoraleBand; label: string }[] = [
  { id: 'lt25', label: 'Below 25' },
  { id: '25to50', label: '25 to 49' },
  { id: '50to75', label: '50 to 74' },
  { id: 'ge75', label: '75 and up' },
];

const moraleEffect = (m: number): string =>
  m > 0 ? `+${m} morale` : m < 0 ? `−${-m} morale` : 'no change to morale';

function Morale({ value }: { value: number }) {
  const band = value < 25 ? 'low' : value < 50 ? 'mid' : 'good';
  return (
    <span
      class={`morale ${band}`}
      role="meter"
      aria-label="Morale"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </span>
  );
}

function WorkerRow({ row, onPick }: { row: PeopleRow; onPick: (id: number) => void }) {
  return (
    <button type="button" class="worker-row" onClick={() => onPick(row.id)}>
      <span class="line">
        <span class="name">{row.name}</span>
        <span>
          {SKILL_NAME[row.skill]}, level {row.level}
        </span>
        {row.locked && (
          <span class="locked" role="img" aria-label="Locked to this job">
            <Icon name="lock" size={14} />
          </span>
        )}
      </span>
      <span class="line small">
        <span class="job">{row.job ? `${row.job}, ${SHIFT_NAMES[row.shift]}` : 'No job'}</span>
        <span class="home">{row.home}</span>
        <Morale value={row.morale} />
      </span>
    </button>
  );
}

/** Workplaces in a section that employ a skill, with their free slots over all shifts. */
function workplaces(snap: UiSnapshot, sectionOf: Map<number, number>, row: PeopleRow) {
  return snap.buildings
    .flatMap((b) => {
      const job = b.jobs[row.skill];
      return job && sectionOf.get(b.id) === row.sectionId
        ? [{ id: b.id, name: `${BUILDINGS[b.type].name} ${b.id}`, open: job.open }]
        : [];
    })
    .sort((a, b) => b.open - a.open || a.id - b.id);
}

function WorkerCard(props: { id: number; onBack: () => void; onChanged: () => void }) {
  const { error, run } = useCommand();
  // undefined while loading; null once the worker is gone.
  const [row, setRow] = useState<PeopleRow | null | undefined>(undefined);
  const [stamp, setStamp] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [shift, setShift] = useState<0 | 1 | 2 | null>(null);
  const [lock, setLock] = useState(false);
  useEffect(() => {
    void simClient.value?.queryPeople({ workerId: props.id }, 0, 1).then((page) => {
      setRow(page.rows[0] ?? null);
    });
  }, [props.id, stamp]);
  const snap = ui.value;
  const w = world.value;
  const back = (
    <button type="button" class="action quiet" onClick={props.onBack}>
      All workers
    </button>
  );
  if (!row || !snap || !w) {
    return (
      <section class="worker" data-testid="worker" aria-label="Worker">
        {back}
        <p>{row === undefined ? 'Looking up this worker.' : ERROR_COPY.UNKNOWN_ID}</p>
      </section>
    );
  }
  const plots = new Map(w.plots.map((p) => [p.id, p.sectionId]));
  const sectionOf = new Map(w.buildings.map((b) => [b.id, plots.get(b.plotId) ?? -1]));
  const sites = workplaces(snap, sectionOf, row);
  // Sites come with the most free slots first.
  const chosen = sites.find((s) => s.id === target) ?? sites[0];
  const changed = (ok: boolean) => {
    if (!ok) return;
    setStamp((n) => n + 1);
    props.onChanged();
  };
  return (
    <section class="worker" data-testid="worker" aria-label={row.name}>
      {back}
      <h3>{row.name}</h3>
      <p>
        {SKILL_NAME[row.skill]}, level {row.level}. Lives in {row.home}.
      </p>
      <p>
        {row.job ? `Works at ${row.job}, ${SHIFT_NAMES[row.shift]} shift.` : 'No job'}
        {row.locked && ' Locked to this job.'}
      </p>
      <p class="morale-line">
        Morale <span class="num">{row.morale}</span> <Morale value={row.morale} />
      </p>
      {sites.length === 0 ? (
        <p>No workplace in this section needs a {row.skill}.</p>
      ) : (
        <>
          <label class="field" for="assign-to">
            Workplace
          </label>
          <select
            id="assign-to"
            value={chosen?.id ?? ''}
            onChange={(e) => setTarget(Number(e.currentTarget.value))}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}, {s.open} open
              </option>
            ))}
          </select>
          <label class="field" for="assign-shift">
            Shift
          </label>
          <select
            id="assign-shift"
            value={shift ?? ''}
            onChange={(e) =>
              setShift(SHIFTS.find((s) => String(s) === e.currentTarget.value) ?? null)
            }
          >
            <option value="">Least crowded</option>
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {SHIFT_NAMES[s]}
              </option>
            ))}
          </select>
          {chosen?.open === 0 && <p class="meta">This workplace has no free slot.</p>}
          <label class="check">
            <input
              type="checkbox"
              checked={lock}
              onChange={(e) => setLock(e.currentTarget.checked)}
            />
            Lock to this job
          </label>
          <button
            type="button"
            class="action"
            disabled={!chosen || chosen.open === 0}
            onClick={() =>
              chosen &&
              void run({
                t: 'assignWorker',
                workerId: row.id,
                buildingId: chosen.id,
                shift: shift ?? undefined,
                lock,
              }).then(changed)
            }
          >
            Assign
          </button>
        </>
      )}
      {row.job && (
        <button
          type="button"
          class="action quiet"
          onClick={() =>
            void run({ t: 'assignWorker', workerId: row.id, buildingId: null, lock: false }).then(
              changed,
            )
          }
        >
          Unassign
        </button>
      )}
      <ErrorText error={error} />
    </section>
  );
}

function Wages({ snap }: { snap: UiSnapshot }) {
  const { error, run } = useCommand();
  return (
    <details class="wages">
      <summary>Wages</summary>
      {SKILLS.map((skill: Skill) => {
        const level = snap.wageLevel[skill];
        const daily = Math.round(WAGE_CENTS_PER_DAY[skill] * WAGE_LEVEL[level].factor);
        return (
          <fieldset key={skill}>
            <legend>{SKILL_NAMES[skill]}</legend>
            <div class="choices">
              {WAGE_LEVELS.map((l) => (
                <label key={l} class="choice">
                  <input
                    type="radio"
                    name={`wage-${skill}`}
                    checked={level === l}
                    onChange={() => void run({ t: 'setWageLevel', skill, level: l })}
                  />
                  {WAGE_NAMES[l]}
                </label>
              ))}
            </div>
            <p class="meta">
              <span class="num">{formatMoney(daily)}</span> a day each,{' '}
              {moraleEffect(WAGE_LEVEL[level].morale)}.
            </p>
          </fieldset>
        );
      })}
      <ErrorText error={error} />
    </details>
  );
}

/** The workforce: wages, filters, and a list of every worker that renders only what is in view. */
export function PeopleTab() {
  const snap = ui.value;
  const [filter, setFilter] = useState<PeopleFilter>({});
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const hour = snap ? Math.floor(snap.tick / 60) : 0;
  // A command (version) or a new game hour refetches the rows in view.
  const fetchPage = useCallback(
    async (offset: number, limit: number): Promise<PeopleRow[]> => {
      const page = await simClient.value?.queryPeople(filter, offset, limit);
      if (!page) return [];
      setTotal(page.total);
      return page.rows;
    },
    [filter, version, hour],
  );
  if (!snap?.company) return <p>{ERROR_COPY.NOT_FOUNDED}</p>;
  const set = (patch: PeopleFilter) => setFilter({ ...filter, ...patch });
  return (
    <div class="people-tab">
      <Wages snap={snap} />
      <div class="filters">
        <label for="people-section">Section</label>
        <select
          id="people-section"
          value={filter.sectionId ?? ''}
          onChange={(e) =>
            set({ sectionId: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })
          }
        >
          <option value="">All</option>
          {snap.sections.map((s) => (
            <option key={s.id} value={s.id}>
              Section {s.id}
            </option>
          ))}
        </select>
        <label for="people-skill">Skill</label>
        <select
          id="people-skill"
          value={filter.skill ?? ''}
          onChange={(e) => set({ skill: SKILLS.find((s) => s === e.currentTarget.value) })}
        >
          <option value="">All</option>
          {SKILLS.map((s) => (
            <option key={s} value={s}>
              {SKILL_NAMES[s]}
            </option>
          ))}
        </select>
        <label for="people-morale">Morale</label>
        <select
          id="people-morale"
          value={filter.morale ?? ''}
          onChange={(e) => set({ morale: BANDS.find((b) => b.id === e.currentTarget.value)?.id })}
        >
          <option value="">All</option>
          {BANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      {picked !== null && (
        <WorkerCard
          id={picked}
          onBack={() => setPicked(null)}
          onChanged={() => setVersion((v) => v + 1)}
        />
      )}
      <div class="people-list" hidden={picked !== null}>
        <p class="count">
          <span class="num">{total.toLocaleString('en-US')}</span>{' '}
          {total === 1 ? 'worker' : 'workers'}
        </p>
        <VirtualList
          key={JSON.stringify(filter)}
          label="Workers"
          rowHeight={ROW_HEIGHT}
          total={total}
          fetchPage={fetchPage}
          renderRow={(row: PeopleRow) => <WorkerRow row={row} onPick={setPicked} />}
        />
      </div>
    </div>
  );
}

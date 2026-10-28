import { useEffect, useRef, useState } from 'preact/hooks';
import { motion, selection, ui, world } from '../../client/store';
import { MAX_LEVEL, upgradeCost, upgradeHours } from '../../data/balance';
import { BUILDINGS, RECIPES, SKILLS, type BuildingDef } from '../../data/buildings';
import {
  BUILDING_STATUS,
  ERROR_COPY,
  PLOT_KIND_NAMES,
  PRIORITY_NAMES,
  SKILL_NAMES,
} from '../../data/copy';
import { GOOD_IDS, GOODS } from '../../data/goods';
import type { MapPick } from '../../render/renderer';
import type { Command } from '../../sim/commands';
import type { Inventory } from '../../sim/inventory';
import type { Priority } from '../../sim/state';
import type { UiSnapshot, WorldView } from '../../sim/views';
import { BuySection } from '../components/BuySection';
import { ErrorText, useCommand } from '../components/command';
import { formatGameDuration, formatMass, formatMoney, formatRealFromGame } from '../format';
import { sectionOfPick } from '../shell/sectionOf';

type Plot = WorldView['plots'][number];
type Built = WorldView['buildings'][number];
type Run = (cmd: Command) => Promise<boolean>;

/** The depot and contract sites are placed by the game; everything else is the player's to build. */
const BUILDABLE = Object.values(BUILDINGS).filter(
  (d) => d.plot === 'deposit' || d.plot === 'build',
);
const PLOT_ORDER = { hub: 0, deposit: 1, build: 2, public: 3 } as const;
const PRIORITIES: Priority[] = ['high', 'normal', 'low'];

/** Names that tell a section's plots apart: deposits by their good, the rest numbered by kind. */
function namePlots(plots: Plot[]): Map<number, string> {
  const counts = { hub: 0, deposit: 0, build: 0, public: 0 };
  return new Map(
    plots.map((p) => {
      if (p.deposit) return [p.id, `${GOODS[p.deposit.goodId].name} deposit`];
      counts[p.kind] += 1;
      return [p.id, p.kind === 'hub' ? 'Hub' : `${PLOT_KIND_NAMES[p.kind]} ${counts[p.kind]}`];
    }),
  );
}

function jobsText(jobs: BuildingDef['jobs']): string {
  const crew = SKILLS.flatMap((s) => {
    const n = jobs[s];
    return n ? [`${n} ${n === 1 ? s : SKILL_NAMES[s].toLowerCase()}`] : [];
  });
  return crew.length ? `Needs ${crew.join(', ')} per shift.` : 'Needs no staff.';
}

function powerText(kw: number): string {
  return kw > 0 ? `Supplies ${kw} kW.` : kw < 0 ? `Uses ${-kw} kW.` : 'Uses no power.';
}

function purposeText(def: BuildingDef, plot: Plot): string | null {
  if (def.extractTph > 0 && plot.deposit) {
    const { goodId, richness } = plot.deposit;
    const tph = def.extractTph * (def.yieldFactor[goodId] ?? 1) * richness;
    return `Extracts ${tph.toFixed(1)} t/h of ${GOODS[goodId].name} with a full crew.`;
  }
  if (def.recipes.length) return `Makes ${def.recipes.map((r) => RECIPES[r].name).join(', ')}.`;
  if (def.housing) return `Houses ${def.housing.capacity} people.`;
  if (def.storageT) return `Stores ${formatMass(def.storageT * 1000)}.`;
  if (def.buses) return `Runs ${def.buses} buses.`;
  return null;
}

const readyIn = (hours: number): string =>
  `Ready in ${formatGameDuration(hours * 60)} (${formatRealFromGame(hours * 60)}).`;

/** Cash and materials, each marked when this section's depot or the bank falls short. */
function Needs({
  cost,
  stock,
  cash,
}: {
  cost: BuildingDef['cost'];
  stock: Inventory;
  cash: number;
}) {
  const short = <span class="visually-hidden"> (not enough)</span>;
  return (
    <p class="needs">
      <span class={cash < cost.cents ? 'num short' : 'num'}>
        {formatMoney(cost.cents)}
        {cash < cost.cents && short}
      </span>
      {GOOD_IDS.filter((g) => cost.materials[g]).map((g) => {
        const kg = Math.round(cost.materials[g]! * 1000);
        const low = (stock[g] ?? 0) < kg;
        return (
          <span key={g} class={low ? 'short' : undefined}>
            {GOODS[g].name} {formatMass(kg)}
            {low && short}
          </span>
        );
      })}
    </p>
  );
}

function PlotList({ plots, w, pick }: { plots: Plot[]; w: WorldView; pick: MapPick | null }) {
  const names = namePlots(plots);
  const on = new Map(w.buildings.map((b) => [b.plotId, b]));
  return (
    <>
      <h3>Plots in this section</h3>
      <ul class="plot-list">
        {plots.map((p) => {
          const b = on.get(p.id);
          const chosen =
            (pick?.kind === 'plot' && pick.id === p.id) ||
            (pick?.kind === 'building' && pick.id === b?.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() =>
                  (selection.value = b
                    ? { kind: 'building', id: b.id }
                    : { kind: 'plot', id: p.id })
                }
              >
                {b ? BUILDINGS[b.type].name : names.get(p.id)}
                {!b && p.deposit && <span class="num"> {p.deposit.richness.toFixed(2)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PlotOptions(props: {
  plot: Plot;
  name: string;
  stock: Inventory;
  cash: number;
  run: Run;
}) {
  const { plot, stock, cash, run } = props;
  const types = BUILDABLE.filter(
    (d) => d.plot === plot.kind && (!plot.deposit || d.depositGoods.includes(plot.deposit.goodId)),
  );
  return (
    <section aria-label={props.name}>
      <h3>{props.name}</h3>
      {types.length === 0 ? (
        <p>
          {plot.kind === 'public'
            ? 'Contracts use public plots for their work.'
            : 'Nothing can be built here.'}
        </p>
      ) : (
        <ul class="options">
          {types.map((d) => {
            const purpose = purposeText(d, plot);
            return (
              <li key={d.id} class="option">
                <div class="option-head">
                  <h4>{d.name}</h4>
                  <button
                    type="button"
                    class="action small"
                    aria-label={`Build ${d.name}`}
                    onClick={() => void run({ t: 'build', plotId: plot.id, type: d.id })}
                  >
                    Build
                  </button>
                </div>
                {purpose && <p>{purpose}</p>}
                <Needs cost={d.cost} stock={stock} cash={cash} />
                <p class="meta">
                  {powerText(d.powerKw)} {jobsText(d.jobs)} {readyIn(d.buildHours)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Demolish({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" class="action quiet" onClick={() => setAsking(true)}>
        Demolish
      </button>
    );
  }
  return (
    <div class="confirm" role="group" aria-label="Demolish">
      <p>Demolish this building? You get 25% of its cost back.</p>
      <button type="button" class="action danger" onClick={onConfirm}>
        Demolish
      </button>
      <button type="button" class="action quiet" onClick={() => setAsking(false)}>
        Keep it
      </button>
    </div>
  );
}

function BuildingManager(props: {
  b: Built;
  live: UiSnapshot['buildings'][number] | undefined;
  stock: Inventory;
  cash: number;
  run: Run;
}) {
  const { b, live, stock, cash, run } = props;
  const def = BUILDINGS[b.type];
  const status = live?.status ?? b.status;
  const busy = status === 'constructing' || status === 'upgrading';
  const progress = Math.floor((live?.progress ?? b.progress) * 100);
  const upgradable = def.buildHours > 0 && b.level < MAX_LEVEL;
  return (
    <section aria-label={def.name}>
      <h3>
        {def.name}, level {b.level}
      </h3>
      <p>{busy ? `${BUILDING_STATUS[status]}, ${progress}%` : BUILDING_STATUS[status]}</p>
      {upgradable && !busy && (
        <div class="option">
          <div class="option-head">
            <h4>Upgrade to level {b.level + 1}</h4>
            <button
              type="button"
              class="action small"
              onClick={() => void run({ t: 'upgrade', buildingId: b.id })}
            >
              Upgrade
            </button>
          </div>
          <Needs cost={upgradeCost(def, b.level)} stock={stock} cash={cash} />
          <p class="meta">{readyIn(upgradeHours(def, b.level))} It stops working until then.</p>
        </div>
      )}
      {b.level >= MAX_LEVEL && <p>{ERROR_COPY.MAX_LEVEL}</p>}
      {live && def.recipes.length > 1 && (
        <label class="field">
          Recipe
          <select
            value={live.recipeId ?? ''}
            onChange={(e) => {
              const recipeId = def.recipes.find((r) => r === e.currentTarget.value);
              if (recipeId) void run({ t: 'setRecipe', buildingId: b.id, recipeId });
            }}
          >
            {def.recipes.map((r) => (
              <option key={r} value={r}>
                {RECIPES[r].name}
              </option>
            ))}
          </select>
        </label>
      )}
      {live && SKILLS.some((s) => def.jobs[s]) && (
        <label class="field">
          Priority for workers
          <select
            value={live.priority}
            onChange={(e) => {
              const priority = PRIORITIES.find((p) => p === e.currentTarget.value);
              if (priority) void run({ t: 'setPriority', buildingId: b.id, priority });
            }}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
      )}
      {b.type !== 'depot' && (
        <Demolish
          key={b.id}
          onConfirm={() =>
            void run({ t: 'demolish', buildingId: b.id }).then((ok) => {
              if (ok) selection.value = { kind: 'plot', id: b.plotId };
            })
          }
        />
      )}
    </section>
  );
}

/** What the selection points at: a plot, and the building on it if any. */
function focusOf(
  pick: MapPick | null,
  w: WorldView,
): { plot: Plot | null; building: Built | null } {
  if (pick?.kind === 'building') {
    const building = w.buildings.find((b) => b.id === pick.id) ?? null;
    return { plot: w.plots.find((p) => p.id === building?.plotId) ?? null, building };
  }
  if (pick?.kind === 'plot') {
    const building = w.buildings.find((b) => b.plotId === pick.id) ?? null;
    return { plot: w.plots.find((p) => p.id === pick.id) ?? null, building };
  }
  return { plot: null, building: null };
}

/** Build on the plots of the selected section (or the founding one); buy sections next door. */
export function BuildTab() {
  const { error, clear, run } = useCommand();
  const pick = selection.value;
  const focusRef = useRef<HTMLDivElement>(null);
  // A new pick starts clean and brings its options into view, below the plot list.
  useEffect(() => {
    clear();
    if (!pick) return;
    const reduced = document.documentElement.dataset.motion === 'reduced';
    focusRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [pick]);
  const snap = ui.value;
  const w = world.value;
  const founding = snap?.sections[0];
  if (!snap?.company || !w || !founding) return <p>{ERROR_COPY.NOT_FOUNDED}</p>;
  const sectionId = (pick && sectionOfPick(pick, w, motion.value?.view.trips ?? [])) ?? founding.id;
  const mine = snap.sections.find((s) => s.id === sectionId);
  const section = w.sections.find((s) => s.id === sectionId);
  const plots = w.plots
    .filter((p) => p.sectionId === sectionId)
    .sort((a, b) => PLOT_ORDER[a.kind] - PLOT_ORDER[b.kind] || a.id - b.id);
  const { plot, building } = focusOf(pick, w);
  let focus = <p>Pick a plot to see what you can build there.</p>;
  if (mine && building) {
    focus = (
      <BuildingManager
        b={building}
        live={snap.buildings.find((x) => x.id === building.id)}
        stock={mine.stockKg}
        cash={snap.cashCents}
        run={run}
      />
    );
  } else if (mine && plot) {
    focus = (
      <PlotOptions
        key={plot.id}
        plot={plot}
        name={namePlots(plots).get(plot.id) ?? PLOT_KIND_NAMES[plot.kind]}
        stock={mine.stockKg}
        cash={snap.cashCents}
        run={run}
      />
    );
  }
  return (
    <div class="build-tab">
      <p class="where">
        Section {sectionId}
        {mine ? '' : ', Lunar Authority'}
      </p>
      {mine ? (
        <>
          <PlotList plots={plots} w={w} pick={pick} />
          <div class="focus" ref={focusRef}>
            {focus}
          </div>
        </>
      ) : section?.buyable ? (
        <>
          <p>The Lunar Authority land office sells this section.</p>
          <BuySection key={section.id} id={section.id} priceCents={snap.landPriceCents} />
        </>
      ) : (
        <p>{ERROR_COPY.NOT_ADJACENT}</p>
      )}
      <ErrorText error={error} />
    </div>
  );
}

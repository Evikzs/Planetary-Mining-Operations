import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { motion, selection, simClient, ui, world } from '../../client/store';
import { BUILDINGS, RECIPES, SKILLS, type Skill } from '../../data/buildings';
import { ERROR_COPY } from '../../data/copy';
import { GOOD_IDS, GOODS } from '../../data/goods';
import type { MapPick } from '../../render/renderer';
import { busLoad, type Trip } from '../../shared/trips';
import type { Inventory } from '../../sim/inventory';
import type { BuildingStatus, Priority } from '../../sim/state';
import type { UiSnapshot, WorldView } from '../../sim/views';
import { formatGameDuration, formatMass, formatMoney } from '../format';
import { Icon } from '../icons';
import { activeTab } from './tabs';

const PLOT_KIND = {
  hub: 'Hub plot',
  build: 'Build plot',
  deposit: 'Deposit',
  public: 'Public plot',
} as const;

const STATUS: Record<BuildingStatus, string> = {
  constructing: 'Under construction',
  upgrading: 'Upgrading',
  active: 'Working',
  blocked: 'Stopped: no room for its output',
  unpowered: 'Short of power',
  unstaffed: 'No workers on shift',
  striking: 'On strike',
};

const SKILL_LABEL: Record<Skill, string> = {
  miner: 'Miners',
  technician: 'Technicians',
  engineer: 'Engineers',
};

const PRIORITY: Record<Priority, string> = { high: 'High', normal: 'Normal', low: 'Low' };

interface Fact {
  label: string;
  value: string;
  num?: boolean;
}

interface View {
  title: string;
  facts: Fact[];
  extra?: ComponentChildren;
}

/** 'Ilmenite 2.40 t, Steel 800 kg'; null when empty. */
function contents(inv: Inventory): string | null {
  const held = GOOD_IDS.filter((g) => (inv[g] ?? 0) > 0);
  return held.length ? held.map((g) => `${GOODS[g].name} ${formatMass(inv[g]!)}`).join(', ') : null;
}

function plotView(id: number, w: WorldView, snap: UiSnapshot | null): View | null {
  const p = w.plots.find((x) => x.id === id);
  if (!p) return null;
  const facts: Fact[] = [];
  if (p.deposit) {
    facts.push(
      { label: 'Resource', value: GOODS[p.deposit.goodId].name },
      { label: 'Richness', value: p.deposit.richness.toFixed(2), num: true },
    );
  }
  facts.push({ label: 'Section', value: String(p.sectionId), num: true });
  const owned = snap?.sections.some((s) => s.id === p.sectionId) ?? false;
  const buildable = p.kind === 'build' || p.kind === 'deposit';
  return {
    title: PLOT_KIND[p.kind],
    facts,
    extra:
      buildable &&
      (owned ? (
        <button type="button" class="action" onClick={() => (activeTab.value = 'build')}>
          Build here
        </button>
      ) : (
        <p class="note">{ERROR_COPY.NOT_OWNED}</p>
      )),
  };
}

function buildingView(id: number, w: WorldView, snap: UiSnapshot | null): View | null {
  const b = w.buildings.find((x) => x.id === id);
  if (!b) return null;
  const live = snap?.buildings.find((x) => x.id === id);
  const status = live?.status ?? b.status;
  const busy = status === 'constructing' || status === 'upgrading';
  const progress = Math.floor((live?.progress ?? b.progress) * 100);
  const facts: Fact[] = [
    { label: 'Status', value: busy ? `${STATUS[status]}, ${progress}%` : STATUS[status] },
    { label: 'Level', value: String(b.level), num: true },
  ];
  if (live) {
    for (const skill of SKILLS) {
      const job = live.jobs[skill];
      if (job) {
        facts.push({ label: SKILL_LABEL[skill], value: `${job.filled}/${job.slots}`, num: true });
      }
    }
    if (live.avgMorale > 0) {
      facts.push({ label: 'Morale', value: String(Math.round(live.avgMorale)), num: true });
    }
    facts.push({ label: 'Power', value: `${Math.round(live.powerFactor * 100)}%`, num: true });
    if (live.recipeId) facts.push({ label: 'Recipe', value: RECIPES[live.recipeId].name });
    for (const g of GOOD_IDS) {
      const tph = live.outputTph[g];
      if (tph) facts.push({ label: GOODS[g].name, value: `${tph.toFixed(2)} t/h`, num: true });
    }
    const input = contents(live.input);
    if (input) facts.push({ label: 'Input', value: input });
    const output = contents(live.output);
    if (output) facts.push({ label: 'Output', value: output });
    facts.push({ label: 'Priority', value: PRIORITY[live.priority] });
  }
  return { title: BUILDINGS[b.type].name, facts };
}

function roverView(
  id: number,
  w: WorldView,
  snap: UiSnapshot | null,
  trips: readonly Trip[],
): View | null {
  const trip = trips.find((t) => t.id === id);
  if (!trip || !snap) return null;
  const load = busLoad(trip, snap.tick);
  const facts: Fact[] = [{ label: 'Riders', value: String(load.aboard), num: true }];
  if (load.next !== null && load.nextAt !== null) {
    const stopId = trip.stops[load.next]!.buildingId;
    const stop = w.buildings.find((b) => b.id === stopId);
    facts.push(
      { label: 'Next stop', value: stop ? BUILDINGS[stop.type].name : 'Unknown' },
      {
        label: 'Arrives in',
        value: formatGameDuration(Math.ceil(load.nextAt - snap.tick)),
        num: true,
      },
    );
  } else {
    facts.push({ label: 'Next stop', value: 'Back to the garage' });
  }
  return { title: trip.kind === 'toWork' ? 'Bus to work' : 'Bus home', facts };
}

function BuySection({ id, priceCents }: { id: number; priceCents: number }) {
  const [error, setError] = useState<string | null>(null);
  const buy = async (): Promise<void> => {
    const result = await simClient.value?.send({ t: 'buySection', sectionId: id });
    setError(result && !result.ok ? ERROR_COPY[result.error] : null);
  };
  return (
    <>
      <button type="button" class="action" onClick={() => void buy()}>
        Buy section — {formatMoney(priceCents)}
      </button>
      <p class="error" aria-live="polite">
        {error}
      </p>
    </>
  );
}

function sectionView(id: number, w: WorldView, snap: UiSnapshot | null): View | null {
  const s = w.sections.find((x) => x.id === id);
  if (!s) return null;
  const facts: Fact[] = [
    { label: 'Owner', value: s.owner === 'player' ? 'You' : 'Lunar Authority' },
  ];
  const mine = snap?.sections.find((x) => x.id === id);
  if (mine) {
    facts.push(
      { label: 'Residents', value: `${mine.residents}/${mine.housingCap}`, num: true },
      { label: 'Power supply', value: `${Math.round(mine.powerSupplyKw)} kW`, num: true },
      { label: 'Power demand', value: `${Math.round(mine.powerDemandKw)} kW`, num: true },
      {
        label: 'Storage',
        value: `${formatMass(mine.storageUsedKg)} of ${formatMass(mine.storageCapKg)}`,
        num: true,
      },
    );
  }
  return {
    title: `Section ${s.id}`,
    facts,
    extra: s.buyable && snap && (
      <BuySection key={s.id} id={s.id} priceCents={snap.landPriceCents} />
    ),
  };
}

function describe(
  pick: MapPick,
  w: WorldView,
  snap: UiSnapshot | null,
  trips: readonly Trip[],
): View | null {
  switch (pick.kind) {
    case 'plot':
      return plotView(pick.id, w, snap);
    case 'building':
      return buildingView(pick.id, w, snap);
    case 'rover':
      return roverView(pick.id, w, snap, trips);
    case 'section':
      return sectionView(pick.id, w, snap);
  }
}

/** Details of the map selection, with what the player can do there. */
export function ContextPanel() {
  const pick = selection.value;
  const w = world.value;
  const view = pick && w ? describe(pick, w, ui.value, motion.value?.view.trips ?? []) : null;
  if (!view) return null;
  return (
    <aside class="context-panel card" data-testid="context-panel" aria-label={view.title}>
      <header>
        <h2>{view.title}</h2>
        <button
          type="button"
          class="icon-button"
          aria-label="Close details"
          onClick={() => (selection.value = null)}
        >
          <Icon name="close" />
        </button>
      </header>
      <div class="body">
        <dl class="facts">
          {view.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd class={f.num ? 'num' : undefined}>{f.value}</dd>
            </div>
          ))}
        </dl>
        {view.extra}
      </div>
    </aside>
  );
}

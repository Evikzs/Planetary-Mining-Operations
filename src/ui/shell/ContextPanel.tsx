import { selection, ui, world } from '../../client/store';
import { BUILDINGS } from '../../data/buildings';
import { GOODS } from '../../data/goods';
import type { MapPick } from '../../render/renderer';
import type { BuildingStatus } from '../../sim/state';
import type { UiSnapshot, WorldView } from '../../sim/views';
import { Icon } from '../icons';

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

function describe(
  pick: MapPick,
  w: WorldView,
  snap: UiSnapshot | null,
): { title: string; lines: string[] } | null {
  if (pick.kind === 'plot') {
    const p = w.plots.find((x) => x.id === pick.id);
    if (!p) return null;
    const lines = [`Section ${p.sectionId}`];
    if (p.deposit) {
      lines.unshift(`${GOODS[p.deposit.goodId].name}, richness ${p.deposit.richness.toFixed(2)}`);
    }
    return { title: PLOT_KIND[p.kind], lines };
  }
  if (pick.kind === 'building') {
    const b = w.buildings.find((x) => x.id === pick.id);
    if (!b) return null;
    const status = snap?.buildings.find((x) => x.id === b.id)?.status ?? b.status;
    return { title: BUILDINGS[b.type].name, lines: [`Level ${b.level}`, STATUS[status]] };
  }
  if (pick.kind === 'section') {
    const s = w.sections.find((x) => x.id === pick.id);
    if (!s) return null;
    const lines = [s.owner === 'player' ? 'Yours' : 'Lunar Authority'];
    if (s.buyable) lines.push('For sale at the land office');
    return { title: `Section ${s.id}`, lines };
  }
  return null;
}

/** Details of the map selection. Task 33 grows these into the full views. */
export function ContextPanel() {
  const pick = selection.value;
  const w = world.value;
  const view = pick && w ? describe(pick, w, ui.value) : null;
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
        {view.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </aside>
  );
}

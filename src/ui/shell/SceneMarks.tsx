import { useEffect, useMemo, useRef } from 'preact/hooks';
import { gameRenderer, reducedMotion, selection, uiScale, world } from '../../client/store';
import { BUILDINGS } from '../../data/buildings';
import { ASSET_NAMES, PLOT_KIND_NAMES } from '../../data/copy';
import { GOODS } from '../../data/goods';
import type { MapPick } from '../../render/renderer';
import { SOL } from '../../render/system/sol';
import type { Asset } from '../../sim/contracts/contracts';
import { PLAYER } from '../../sim/companies';
import type { WorldView } from '../../sim/views';
import type { Vec3 } from '../../shared/vec3';

/** Names show from the region view up; from orbit, only each company's charter. */
const NAMES_FROM = 15;
const ORBIT = 60;
const TOWN_ALTITUDE = 5;
const FLY_MS = 1400;

interface Site {
  key: string;
  dir: Vec3;
  title: string;
  sub: string;
  colour: string;
  charter: boolean;
}

/** One site per owned section: its hub, under its company's name. */
function sitesOf(w: WorldView): Site[] {
  const out: Site[] = [];
  const seen = new Set<number>();
  for (const s of [...w.sections].sort((a, b) => a.id - b.id)) {
    if (s.owner === null) continue;
    const company = w.companies.find((c) => c.id === s.owner);
    const hub = w.plots.find((p) => p.sectionId === s.id && p.kind === 'hub');
    if (!company || company.status !== 'active' || !hub) continue;
    out.push({
      key: `s${s.id}`,
      dir: hub.dir,
      title: s.owner === PLAYER ? 'You' : company.name,
      sub: `Section ${s.id}`,
      colour: `var(--co-${company.colour})`,
      charter: !seen.has(company.id),
    });
    seen.add(company.id);
  }
  return out;
}

/** What a hover over the map names: buildings, buses and free plots, not the bare ground. */
function nameOf(pick: MapPick, w: WorldView): string | null {
  if (pick.kind === 'rover') return 'Bus';
  if (pick.kind === 'section') return null;
  const plotId = pick.kind === 'plot' ? pick.id : w.buildings.find((b) => b.id === pick.id)?.plotId;
  const building = w.buildings.find((b) => b.plotId === plotId);
  if (building) return BUILDINGS[building.type].name;
  const asset = w.clientAssets.find((a) => a.plotId === plotId);
  if (asset) return ASSET_NAMES[asset.asset as Asset] ?? null;
  const plot = w.plots.find((p) => p.id === plotId);
  if (!plot) return null;
  return plot.deposit ? `${GOODS[plot.deposit.goodId].name} deposit` : PLOT_KIND_NAMES[plot.kind];
}

const hide = (el: HTMLElement | null | undefined): void => {
  if (el && !el.hidden) el.hidden = true;
};

/**
 * Fable's names in the scene: the companies' sites, a tag under the pointer, and corner marks
 * round the selection. Positions move every frame, so they are set on the elements directly.
 */
export function SceneMarks() {
  const w = world.value;
  const sites = useMemo(() => (w ? sitesOf(w) : []), [w]);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const worlds = useRef(new Map<number, HTMLButtonElement>());
  const reticle = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pointer = { x: 0, y: 0, over: false, moved: false };
    const onMove = (e: PointerEvent) => {
      const map = e.target instanceof HTMLCanvasElement && e.target.classList.contains('map');
      pointer.over = map && e.buttons === 0;
      if (!pointer.over) return;
      const box = (e.target as HTMLCanvasElement).getBoundingClientRect();
      pointer.x = e.clientX - box.left;
      pointer.y = e.clientY - box.top;
      pointer.moved = true;
    };
    const onLeave = () => (pointer.over = false);
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);
    let raf = 0;
    let frame = 0;
    let hit: MapPick | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const r = gameRenderer.value;
      const scale = uiScale.value;
      const sol = r?.mode() === 'system';
      // In the view of Sol: a name beside each world, and nothing of the Moon's.
      const marks = sol && r ? r.bodyMarks() : [];
      for (const [index, el] of worlds.current) {
        const m = marks.find((x) => x.index === index);
        if (!m) {
          hide(el);
          continue;
        }
        el.hidden = false;
        el.style.transform = `translate(${((m.x + m.r) / scale + 6).toFixed(1)}px, ${(m.y / scale).toFixed(1)}px) translateY(-50%)`;
      }
      const alt = sol ? -Infinity : (r?.camera().altitude ?? Infinity);
      for (const s of sites) {
        const el = nodes.current.get(s.key);
        const p =
          r && alt >= NAMES_FROM && (s.charter || alt < ORBIT) ? r.project(s.dir, 0.6) : null;
        if (!el) continue;
        if (!p) {
          hide(el);
          continue;
        }
        el.hidden = false;
        el.style.transform = `translate(${(p.x / scale + 4).toFixed(1)}px, ${(p.y / scale).toFixed(1)}px) translateY(-50%)`;
      }
      const sel = selection.value;
      const box = r && sel && !sol ? r.screenBox(sel) : null;
      const ret = reticle.current;
      if (ret) {
        if (!box) hide(ret);
        else {
          ret.hidden = false;
          const size = box.size / scale;
          ret.style.width = ret.style.height = `${size.toFixed(1)}px`;
          ret.style.transform = `translate(${(box.x / scale - size / 2).toFixed(1)}px, ${(box.y / scale - size / 2).toFixed(1)}px)`;
          ret.dataset.kind = sel?.kind ?? '';
        }
      }
      // A hover pick every third frame is enough to follow the pointer.
      if (pointer.moved && frame++ % 3 === 0) {
        pointer.moved = false;
        hit = r && pointer.over ? r.pick(pointer.x, pointer.y) : null;
      }
      const t = tag.current;
      const name = hit && world.value && pointer.over && !sol ? nameOf(hit, world.value) : null;
      if (!t || !name || (sel && hit && sel.kind === hit.kind && sel.id === hit.id)) hide(t);
      else {
        t.hidden = false;
        if (t.firstChild?.textContent !== name) t.firstChild!.textContent = name;
        t.style.transform = `translate(${(pointer.x / scale + 14).toFixed(1)}px, ${(pointer.y / scale + 18).toFixed(1)}px)`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [sites]);

  const goTo = (s: Site) => {
    const r = gameRenderer.value;
    if (r) r.flyTo(s.dir, TOWN_ALTITUDE, reducedMotion.value ? 0 : FLY_MS);
  };

  return (
    <div class="labels" aria-hidden="true">
      {sites.map((s) => (
        <button
          key={s.key}
          type="button"
          class="label"
          data-kind="site"
          tabIndex={-1}
          hidden
          style={{ '--c': s.colour }}
          ref={(el) => {
            if (el) nodes.current.set(s.key, el);
            else nodes.current.delete(s.key);
          }}
          onClick={() => goTo(s)}
        >
          <b>{s.title}</b>
          <span>{s.sub}</span>
        </button>
      ))}
      {SOL.map((b, i) => (
        <button
          key={b.id}
          type="button"
          class="label"
          data-kind="world"
          tabIndex={-1}
          hidden
          ref={(el) => {
            if (el) worlds.current.set(i, el);
            else worlds.current.delete(i);
          }}
          onClick={() => {
            const again = selection.value?.kind === 'body' && selection.value.id === i;
            selection.value = { kind: 'body', id: i };
            // A second click on Luna goes down to it.
            if (again && b.landable) gameRenderer.value?.dive();
          }}
        >
          <b>{b.name}</b>
          <span>{b.status}</span>
        </button>
      ))}
      <div class="reticle" ref={reticle} hidden />
      <div class="label" data-kind="tag" ref={tag} hidden>
        <b />
      </div>
    </div>
  );
}

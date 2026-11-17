import gsap from 'gsap';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  clock,
  gameRenderer,
  motion,
  pinnedGoods,
  reducedMotion,
  selection,
  ui,
  world,
} from '../../client/store';
import { GOODS, type GoodId } from '../../data/goods';
import { MINERALS } from '../../data/minerals';
import { minuteOfDay } from '../../sim/clock';
import type { UiSnapshot } from '../../sim/views';
import type { RawGoodId } from '../../sim/world/types';
import { formatMass, formatMoney, trendOf } from '../format';
import { EASE } from '../motion/eases';
import { AlertsBell } from './Alerts';
import { ClockControls } from './ClockControls';
import { sectionOfPick } from './sectionOf';

/** Ledger keys for goods with long names; the full name shows on hover. */
const SHORT_NAME: Partial<Record<GoodId, string>> = {
  regolith: 'Regolith',
  helium3: 'He-3',
  kreep: 'KREEP',
  polarVolatiles: 'Volatiles',
  titaniumAlloy: 'Titanium',
  sinteredConcrete: 'Concrete',
  siliconWafers: 'Wafers',
  rareEarthOxides: 'Rare earths',
  potableWater: 'Water',
  hydroponicProduce: 'Produce',
  prefabStructures: 'Prefab',
  solarPanels: 'Panels',
};

/** Orbit altitude for the "Luna" crumb, and the section view for the section crumb. */
const ORBIT_ALTITUDE = 200;
const SECTION_ALTITUDE = 12;
const FLY_MS = 1400;

/** Rolls up to each new amount over 600 ms; shows it at once with reduced motion or on first show. */
function Cash({ cents }: { cents: number | null }) {
  const [shown, setShown] = useState(cents);
  const rolling = useRef({ v: cents ?? 0 });
  useEffect(() => {
    const roll = rolling.current;
    if (cents === null || shown === null || document.documentElement.dataset.motion === 'reduced') {
      roll.v = cents ?? 0;
      setShown(cents);
      return;
    }
    const tween = gsap.to(roll, {
      v: cents,
      duration: 0.6,
      ease: EASE.roll,
      onUpdate: () => setShown(Math.round(roll.v)),
    });
    return () => {
      tween.kill();
    };
  }, [cents]);
  return (
    <span class="slot-value num" data-testid="cash">
      {shown === null ? '–' : formatMoney(shown)}
    </span>
  );
}

/** '4.25 t' as the figure 4.25 with its unit set small beside it. */
function Figure({ text }: { text: string }) {
  const cut = text.lastIndexOf(' ');
  return (
    <span class="slot-value num">
      {cut < 0 ? text : text.slice(0, cut)}
      {cut >= 0 && <small>{text.slice(cut + 1)}</small>}
    </span>
  );
}

const isRaw = (g: GoodId): g is RawGoodId => g in MINERALS;

function GoodSlot({ good, kg, history }: { good: GoodId; kg: number; history: number[] }) {
  const trend = trendOf(history);
  return (
    <li class="slot" data-tip={GOODS[good].name}>
      <span class="slot-label">
        {isRaw(good) && (
          <i class="gem" style={{ '--ore': MINERALS[good].color }} aria-hidden="true" />
        )}
        {SHORT_NAME[good] ?? GOODS[good].name}
      </span>
      <Figure text={formatMass(kg)} />
      <span class={`slot-rate ${trend}`}>
        {trend === 'up' ? 'Price rising' : trend === 'down' ? 'Price falling' : ''}
      </span>
    </li>
  );
}

function Readouts({ snap, sectionId }: { snap: UiSnapshot; sectionId: number | undefined }) {
  const section = snap.sections.find((s) => s.id === sectionId);
  const short = section && section.powerSupplyKw < section.powerDemandKw;
  return (
    <>
      <ul class="goods" aria-label={section ? `Stock in section ${section.id}` : 'Stock'}>
        {section &&
          pinnedGoods.value.map((g) => (
            <GoodSlot
              key={g}
              good={g}
              kg={section.stockKg[g] ?? 0}
              history={snap.market.find((m) => m.goodId === g)?.history ?? []}
            />
          ))}
      </ul>
      <span class="slot" data-tip="Workers employed, of all workers">
        <span class="slot-label">Workforce</span>
        <span class="slot-value num">
          {snap.workforce.employed}
          <small>/ {snap.workforce.total}</small>
        </span>
        <span class="slot-rate" />
      </span>
      {section && (
        <span class="slot" data-tip={`Power in section ${section.id}: supply and demand`}>
          <span class="slot-label">Power</span>
          <span class="slot-value num">
            {Math.round(section.powerSupplyKw)}
            <small>/ {Math.round(section.powerDemandKw)} kW</small>
          </span>
          <span class={`slot-rate ${short ? 'short' : 'spare'}`}>
            {short
              ? 'Short'
              : `${Math.round(section.powerSupplyKw - section.powerDemandKw)} kW spare`}
          </span>
        </span>
      )}
      <span class="slot" data-tip="Reputation">
        <span class="slot-label">Reputation</span>
        <span class="slot-value num">{Math.round(snap.reputation.luna)}</span>
        <span class="slot-rate" />
      </span>
    </>
  );
}

/** The sun over the local horizon, from the hour of the day; the night arc is dashed. */
function SunDial({ hour }: { hour: number }) {
  const a = ((hour - 6) / 12) * Math.PI;
  const s = Math.sin(a);
  return (
    <svg class="dial" viewBox="0 0 132 52" aria-hidden="true">
      <path d="M12 36A54 28 0 0 1 120 36" />
      <path class="night" d="M12 36A54 12 0 0 0 120 36" />
      <line x1="4" y1="36" x2="128" y2="36" />
      <circle
        cx={(66 - 54 * Math.cos(a)).toFixed(1)}
        cy={(36 - (s >= 0 ? 28 : 12) * s).toFixed(1)}
        r="4.5"
        data-night={s < 0 || undefined}
      />
    </svg>
  );
}

/** The sun dial, the date with the hour set large, and the speeds. */
function Clock({ snap }: { snap: UiSnapshot }) {
  const c = clock.value;
  const slow = !c.paused && c.actualSpeed < 0.9 * c.speed;
  const [day = '', hour = ''] = snap.date.split(' ');
  return (
    <div class="clock">
      <SunDial hour={minuteOfDay(snap.tick) / 60} />
      <div class="time">
        <span class="when num" data-testid="game-date">
          <span class="day">{day}</span> <span class="hour">{hour}</span>
        </span>
        <span class="state">
          {c.paused ? (
            <span class="stamp" data-testid="paused">
              Paused
            </span>
          ) : slow ? (
            <span class="meta" data-testid="real-speed">
              Running at {c.actualSpeed.toFixed(1)}×
            </span>
          ) : null}
        </span>
      </div>
      <ClockControls />
    </div>
  );
}

/** Flies the map: out to the whole Moon, or down to a section's hub. */
function fly(dir: readonly [number, number, number] | undefined, altitude: number): void {
  const r = gameRenderer.value;
  if (!r) return;
  r.flyTo(dir ?? r.camera().pos, altitude, reducedMotion.value ? 0 : FLY_MS);
}

/** Only shown once the company exists: the Shell renders it after founding. */
export function TopBar() {
  const snap = ui.value;
  const pick = selection.value;
  const w = world.value;
  if (!snap?.company) return null;
  const picked = pick && w ? sectionOfPick(pick, w, motion.value?.view.trips ?? []) : null;
  // The selected section, or else the founding one.
  const sectionId = (snap.sections.find((s) => s.id === picked) ?? snap.sections[0])?.id;
  const hub = w?.plots.find((p) => p.sectionId === sectionId && p.kind === 'hub');
  return (
    <header class="topbar" data-testid="top-bar">
      <div class="place">
        <nav class="crumbs" aria-label="Location">
          <button
            type="button"
            data-tip="See the whole Moon"
            onClick={() => fly(undefined, ORBIT_ALTITUDE)}
          >
            Luna
          </button>
          {sectionId !== undefined && (
            <button
              type="button"
              data-tip={`Fly to section ${sectionId}`}
              onClick={() => fly(hub?.dir, SECTION_ALTITUDE)}
            >
              Section {sectionId}
            </button>
          )}
        </nav>
        <h1>{snap.company.name}</h1>
      </div>
      <div class="ledger">
        <span class="slot" data-tip="Cash">
          <span class="slot-label">Cash</span>
          <Cash cents={snap.cashCents} />
          <span class="slot-rate" />
        </span>
        <Readouts snap={snap} sectionId={sectionId} />
      </div>
      <Clock snap={snap} />
      <AlertsBell />
    </header>
  );
}

import gsap from 'gsap';
import { useEffect, useRef, useState } from 'preact/hooks';
import { motion, pinnedGoods, selection, ui, world } from '../../client/store';
import { GOODS, type GoodId } from '../../data/goods';
import type { UiSnapshot } from '../../sim/views';
import { APP_TITLE } from '../App';
import { Trend } from '../components/Trend';
import { formatMass, formatMoney } from '../format';
import { Icon } from '../icons';
import { EASE } from '../motion/eases';
import { AlertsBell } from './Alerts';
import { sectionOfPick } from './sectionOf';

/** Top-bar labels for goods with long names; the full name shows on hover. */
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
    <span class="num" data-testid="cash">
      {shown === null ? '–' : formatMoney(shown)}
    </span>
  );
}

function GoodSlot({ good, kg, history }: { good: GoodId; kg: number; history: number[] }) {
  return (
    <li class="slot" title={GOODS[good].name}>
      <span class="slot-label">{SHORT_NAME[good] ?? GOODS[good].name}</span>
      <span class="num">{formatMass(kg)}</span>
      <Trend history={history} />
    </li>
  );
}

function Readouts({ snap }: { snap: UiSnapshot }) {
  const pick = selection.value;
  const w = world.value;
  const picked = pick && w ? sectionOfPick(pick, w, motion.value?.view.trips ?? []) : null;
  // The founding section comes first.
  const section = snap.sections.find((s) => s.id === picked) ?? snap.sections[0];
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
      <span class="slot" title="Workers employed, of all workers">
        <span class="visually-hidden">Workforce</span>
        <Icon name="workforce" size={18} />
        <span class="num">
          {snap.workforce.employed}/{snap.workforce.total}
        </span>
      </span>
      {section && (
        <span
          class="slot"
          data-short={section.powerSupplyKw < section.powerDemandKw || undefined}
          title={`Power in section ${section.id}: supply and demand`}
        >
          <span class="visually-hidden">Power</span>
          <Icon name="power" size={18} />
          <span class="num">
            {Math.round(section.powerSupplyKw)}/{Math.round(section.powerDemandKw)} kW
          </span>
        </span>
      )}
      <span class="slot" title="Reputation">
        <span class="visually-hidden">Reputation</span>
        <Icon name="reputation" size={18} />
        <span class="num">{Math.round(snap.reputation)}</span>
      </span>
    </>
  );
}

export function TopBar() {
  const snap = ui.value;
  const founded = snap?.company ? snap : null;
  return (
    <header class="topbar" data-testid="top-bar">
      <h1>{snap?.company?.name ?? APP_TITLE}</h1>
      <span class="slot">
        <span class="slot-label">Cash</span>
        <Cash cents={founded ? founded.cashCents : null} />
      </span>
      {founded && <Readouts snap={founded} />}
      <span class="slot date">
        <span class="num" data-testid="game-date">
          {snap?.date ?? ''}
        </span>
      </span>
      {founded && <AlertsBell />}
    </header>
  );
}

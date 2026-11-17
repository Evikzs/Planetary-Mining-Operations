import { cameraAltitude, gameRenderer, reducedMotion } from '../../client/store';
import { MAX_ALTITUDE, MIN_ALTITUDE } from '../../render/camera/globeCamera';
import { METRES_PER_UNIT } from '../../render/world/kit';

/** One rock layer of the log for each scale of the view; a click flies there. */
export const TIERS = [
  { name: 'System', alt: null, say: '' },
  { name: 'Orbit', alt: 200, say: 'Pick a filter to read the whole Moon. Scroll in to go down.' },
  { name: 'Region', alt: 30, say: 'Click a name to fly there. Scroll in to see a section.' },
  {
    name: 'Town',
    alt: 5,
    say: 'Click a building, a bus or a seam. Scroll in to walk the streets.',
  },
  { name: 'Street', alt: 0.5, say: 'Right-drag to turn. The lamps come on at dusk.' },
] as const;

/** Where each tier starts, from the top of orbit down to the street. */
const STOPS = [MAX_ALTITUDE, 60, 15, 1.5, MIN_ALTITUDE];
const FLY_MS = 1400;

/** 1 at the top of orbit to 5 at the street, even in log altitude; 0 to 1 is the system above. */
export function gaugePosition(alt: number): number {
  for (let i = 0; i < 4; i++) {
    if (alt > STOPS[i + 1]! || i === 3) {
      const [a, b] = [Math.log(STOPS[i]!), Math.log(STOPS[i + 1]!)];
      return 1 + i + Math.min(1, Math.max(0, (a - Math.log(alt)) / (a - b)));
    }
  }
  return 5;
}

/** '640 m', '2.4 km'. */
export const groundDistance = (alt: number): string => {
  const m = alt * METRES_PER_UNIT;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
};

// Fable's borehole log: rock symbols, one band per tier.
const PATTERNS = [
  <pattern key="0" id="gp0" width="13" height="17" patternUnits="userSpaceOnUse">
    <circle cx="3" cy="4" r="1" />
    <circle cx="10" cy="12" r=".8" />
  </pattern>,
  <pattern key="1" id="gp1" width="26" height="16" patternUnits="userSpaceOnUse">
    <path d="M3 4H16M11 12H24" />
  </pattern>,
  <pattern key="2" id="gp2" width="8" height="8" patternUnits="userSpaceOnUse">
    <path d="M-2 10L10 -2" />
  </pattern>,
  <pattern key="3" id="gp3" width="13" height="10" patternUnits="userSpaceOnUse">
    <path d="M0 .5H13M0 5.5H13M3 .5V5.5M9.5 5.5V10.5" />
  </pattern>,
  <pattern key="4" id="gp4" width="9" height="9" patternUnits="userSpaceOnUse">
    <path d="M4.5 2.5V6.5M2.5 4.5H6.5" />
  </pattern>,
];

/** The depth gauge: where the view is, from the system down to one street. */
export function DepthGauge() {
  const alt = cameraAltitude.value;
  const pos = gaugePosition(alt);
  const tier = Math.min(4, Math.floor(pos));
  const fly = (to: number) => {
    const r = gameRenderer.value;
    if (r) r.flyTo(r.camera().pos, to, reducedMotion.value ? 0 : FLY_MS);
  };
  return (
    <div class="gauge" data-testid="depth-gauge" role="group" aria-label="View depth">
      <div class="core" aria-hidden="true">
        <svg viewBox="0 0 26 250" preserveAspectRatio="none">
          <defs>{PATTERNS}</defs>
          <rect class="band-on" x="0" y={tier * 50} width="26" height="50" />
          {PATTERNS.map((_, i) => (
            <g key={i}>
              <rect x="0" y={i * 50} width="26" height="50" fill={`url(#gp${i})`} />
              {i > 0 && <line x1="0" y1={i * 50} x2="26" y2={i * 50} />}
            </g>
          ))}
        </svg>
        <div class="cage" style={{ top: `${(pos / 5) * 100}%` }} />
      </div>
      <div class="tiers">
        {TIERS.map((t, i) => (
          <button
            key={t.name}
            type="button"
            aria-current={i === tier}
            disabled={t.alt === null}
            data-tip={t.alt === null ? 'The Sol system view comes later' : `Fly to ${t.name}`}
            onClick={() => t.alt !== null && fly(t.alt)}
          >
            {t.name}
          </button>
        ))}
      </div>
      <p class="alt">
        From the ground <b class="num">{groundDistance(alt)}</b>
      </p>
      <p class="say">{TIERS[tier]!.say}</p>
    </div>
  );
}

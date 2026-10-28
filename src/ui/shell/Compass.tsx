import { compass, gameRenderer } from '../../client/store';
import { setLockNorth } from '../../render/camera/globeCamera';

/** Points north on screen; pressing it locks or frees north. */
export function Compass() {
  const { heading, lockNorth } = compass.value;
  const toggle = () => {
    const r = gameRenderer.value;
    if (r) r.setCamera(setLockNorth(r.camera(), !lockNorth));
  };
  const turn = ((-heading * 180) / Math.PI).toFixed(1);
  return (
    <button
      type="button"
      class="compass"
      data-testid="compass"
      aria-label="Lock north"
      aria-pressed={lockNorth}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g transform={`rotate(${turn} 12 12)`}>
          <path class="north" d="M12 3l3.5 9h-7z" />
          <path class="south" d="M12 21l-3.5-9h7z" />
        </g>
      </svg>
    </button>
  );
}

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from '../icons';

/** Mobile bottom sheet that snaps to half or nearly full height. */
export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  const [snap, setSnap] = useState<'half' | 'full'>('half');
  const [startY, setStartY] = useState<number | null>(null);
  return (
    <section class="sheet card" data-testid="tab-panel" data-snap={snap} aria-label={props.title}>
      <button
        type="button"
        class="handle"
        aria-label={snap === 'half' ? 'Expand panel' : 'Shrink panel'}
        onClick={() => setSnap(snap === 'half' ? 'full' : 'half')}
        onPointerDown={(e) => setStartY(e.clientY)}
        onPointerUp={(e) => {
          if (startY === null) return;
          const dy = e.clientY - startY;
          setStartY(null);
          if (dy < -40) setSnap('full');
          else if (dy > 40) {
            if (snap === 'full') setSnap('half');
            else props.onClose();
          }
        }}
      />
      <header>
        <h2>{props.title}</h2>
        <button type="button" class="icon-button" aria-label="Close panel" onClick={props.onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div class="body">{props.children}</div>
    </section>
  );
}

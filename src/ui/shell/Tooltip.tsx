import { useEffect, useState } from 'preact/hooks';

const DELAY_MS = 400;

/** One tooltip for every element with `data-tip`: it shows after a rest of 400 ms. */
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    let target: Element | null = null;
    const hide = () => {
      clearTimeout(timer);
      target = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
      if (el === target) return;
      hide();
      if (!el) return;
      target = el;
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const x = Math.min(window.innerWidth - 8, Math.max(8, r.left + r.width / 2));
        setTip({ text: el.getAttribute('data-tip') ?? '', x, y: r.bottom + 6 });
      }, DELAY_MS);
    };
    const out = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    window.addEventListener('keydown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      hide();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      window.removeEventListener('keydown', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!tip) return null;
  return (
    <div class="tooltip" role="tooltip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>
      {tip.text}
    </div>
  );
}

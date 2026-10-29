import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

interface VirtualListProps<T> {
  /** The list's accessible name. */
  label: string;
  rowHeight: number;
  total: number;
  fetchPage: (offset: number, limit: number) => Promise<T[]>;
  renderRow: (row: T) => JSX.Element;
  overscan?: number;
}

/** A long list that renders only the rows in view, plus `overscan` on each side, fetched as needed. */
export function VirtualList<T>(props: VirtualListProps<T>) {
  const { rowHeight, total, fetchPage, overscan = 5 } = props;
  const box = useRef<HTMLUListElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  const [page, setPage] = useState<{ offset: number; rows: T[] }>({ offset: 0, rows: [] });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(view.top / rowHeight) - overscan);
  const last = Math.min(total, Math.ceil((view.top + view.height) / rowHeight) + overscan);

  useEffect(() => {
    let live = true;
    void fetchPage(first, last - first).then((rows) => {
      if (live) setPage({ offset: first, rows });
    });
    return () => {
      live = false;
    };
  }, [first, last, fetchPage]);

  return (
    <ul
      class="vlist"
      ref={box}
      aria-label={props.label}
      onScroll={(e) =>
        setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })
      }
    >
      {/* Gives the list its full height, so the scrollbar spans every row. */}
      <li role="none" aria-hidden="true" style={{ top: 0, height: `${total * rowHeight}px` }} />
      {page.rows.map((row, i) => (
        <li
          key={page.offset + i}
          aria-posinset={page.offset + i + 1}
          aria-setsize={total}
          style={{ top: `${(page.offset + i) * rowHeight}px`, height: `${rowHeight}px` }}
        >
          {props.renderRow(row)}
        </li>
      ))}
    </ul>
  );
}

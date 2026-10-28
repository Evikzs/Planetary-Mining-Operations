import type { MapPick } from '../../render/renderer';

interface Places {
  plots: readonly { id: number; sectionId: number }[];
  buildings: readonly { id: number; plotId: number }[];
}

/** The section a map selection lies in; null when it no longer exists. */
export function sectionOfPick(
  pick: MapPick,
  w: Places,
  trips: readonly { id: number; sectionId: number }[],
): number | null {
  const plotSection = (plotId: number | undefined) =>
    w.plots.find((p) => p.id === plotId)?.sectionId ?? null;
  switch (pick.kind) {
    case 'section':
      return pick.id;
    case 'plot':
      return plotSection(pick.id);
    case 'building':
      return plotSection(w.buildings.find((b) => b.id === pick.id)?.plotId);
    case 'rover':
      return trips.find((t) => t.id === pick.id)?.sectionId ?? null;
  }
}

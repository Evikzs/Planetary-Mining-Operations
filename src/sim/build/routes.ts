import type { Vec3 } from '../../shared/vec3';
import type { GameState } from '../state';
import { worldOf } from '../world/luna';
import { roadPath, type RoadNet } from '../world/roads';
import { gridFor, sectionState } from './sections';

export type Route = { points: Vec3[]; length: number } | null;

// Roads only ever grow, so the road cell count names the network's version.
const routeCache = new WeakMap<RoadNet, { version: number; routes: Map<string, Route> }>();

/** The road route between two plots of a section, or null when no road joins them. */
export function plotRoute(
  state: GameState,
  sectionId: number,
  fromPlotId: number,
  toPlotId: number,
): Route {
  const net = sectionState(state, sectionId)?.roadNet;
  if (!net) return null;
  let cache = routeCache.get(net);
  if (cache?.version !== net.roadCells.length) {
    cache = { version: net.roadCells.length, routes: new Map() };
    routeCache.set(net, cache);
  }
  const key = `${fromPlotId}>${toPlotId}`;
  let route = cache.routes.get(key);
  if (route === undefined) {
    const plots = worldOf(state).plots;
    route = roadPath(gridFor(state, sectionId), net, plots[fromPlotId]!.dir, plots[toPlotId]!.dir);
    cache.routes.set(key, route);
  }
  return route;
}

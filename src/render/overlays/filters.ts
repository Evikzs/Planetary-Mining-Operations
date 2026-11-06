import type { CompanyId } from '../../sim/companies';
import type { WorldView } from '../../sim/views';
import type { RawGoodId } from '../../sim/world/types';
import { palette } from '../../ui/tokens';

/** From orbit the map shows one planetary filter; up close, one local filter or none. */
export interface MapFilter {
  planetary: 'ownership' | 'contracts' | { resource: RawGoodId };
  local: 'none' | 'power' | 'morale' | 'throughput' | 'jams';
}

export const DEFAULT_FILTER: MapFilter = { planetary: 'ownership', local: 'none' };

/** Teal at or above okAt, mustard from warnAt, rust below warnAt. */
export function filterTint(value: number, okAt: number, warnAt: number): string {
  if (value >= okAt) return palette.teal;
  return value >= warnAt ? palette.mustard : palette.rust;
}

/** A company's map colour; null for the Lunar Authority's land. */
export function ownerColour(
  owner: CompanyId | null,
  companies: WorldView['companies'],
): string | null {
  const c = owner === null ? undefined : companies.find((x) => x.id === owner);
  return c ? palette[c.colour] : null;
}

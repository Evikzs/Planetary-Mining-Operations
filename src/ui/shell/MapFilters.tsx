import { mapFilter, mapLevel, world } from '../../client/store';
import { GOODS } from '../../data/goods';
import type { MapFilter } from '../../render/overlays/filters';
import { PLAYER } from '../../sim/companies';
import { RAW_GOODS } from '../../sim/world/types';

const PLANETARY: { label: string; value: MapFilter['planetary'] }[] = [
  { label: 'Ownership', value: 'ownership' },
  { label: 'Contracts', value: 'contracts' },
  ...RAW_GOODS.map((g) => ({ label: GOODS[g].name, value: { resource: g } })),
];

const LOCAL: { label: string; value: MapFilter['local'] }[] = [
  { label: 'Power', value: 'power' },
  { label: 'Morale', value: 'morale' },
  { label: 'Throughput', value: 'throughput' },
  { label: 'Jams', value: 'jams' },
];

const same = (a: MapFilter['planetary'], b: MapFilter['planetary']): boolean =>
  typeof a === 'object' && typeof b === 'object' ? a.resource === b.resource : a === b;

/** Who owns what, in each company's colour, under the Ownership chip. */
function OwnerLegend() {
  const companies = world.value?.companies.filter((c) => c.status === 'active') ?? [];
  if (!companies.length) return null;
  return (
    <ul class="map-legend" aria-label="Owners" data-testid="map-legend">
      {companies.map((c) => (
        <li key={c.id}>
          <span class="swatch" data-colour={c.colour} aria-hidden="true" />
          {c.id === PLAYER ? 'You' : c.name}
        </li>
      ))}
    </ul>
  );
}

/** Filter chips over the map: planetary ones from orbit, local ones up close. */
export function MapFilters() {
  const f = mapFilter.value;
  const planetary = mapLevel.value === 'planetary';
  return (
    <>
      <div class="map-filters" role="toolbar" aria-label="Map filters" data-testid="map-filters">
        {planetary
          ? PLANETARY.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={same(f.planetary, c.value)}
                onClick={() => (mapFilter.value = { ...f, planetary: c.value })}
              >
                {c.label}
              </button>
            ))
          : LOCAL.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={f.local === c.value}
                onClick={() =>
                  (mapFilter.value = { ...f, local: f.local === c.value ? 'none' : c.value })
                }
              >
                {c.label}
              </button>
            ))}
      </div>
      {planetary && f.planetary === 'ownership' && <OwnerLegend />}
    </>
  );
}

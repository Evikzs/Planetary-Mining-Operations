import { describe, expect, it } from 'vitest';
import { hashState } from '../../../src/sim/hash';
import { generateLuna } from '../../../src/sim/world/luna';
import { sectionAt } from '../../../src/sim/world/sections';
import { LUNA_RADIUS, PLOT_SPACING } from '../../../src/shared/scale';
import { angleBetween, latLon } from '../../../src/shared/vec3';

describe('plots', () => {
  const world = generateLuna(42);

  it('every plot lies in its section; per section 1 hub, 12 build, 2 public, ≥ 1 regolith deposit', () => {
    for (const s of world.sections) {
      const plots = world.plots.filter((p) => p.sectionId === s.id);
      expect(plots.filter((p) => p.kind === 'hub')).toHaveLength(1);
      expect(plots.filter((p) => p.kind === 'build')).toHaveLength(12);
      expect(plots.filter((p) => p.kind === 'public')).toHaveLength(2);
      expect(plots.some((p) => p.deposit?.goodId === 'regolith')).toBe(true);
      expect(world.plots[s.hubPlotId]?.kind).toBe('hub');
    }
    for (const p of world.plots) expect(sectionAt(world.sections, p.dir)).toBe(p.sectionId);
  });

  it('plot ids are their array index', () => {
    world.plots.forEach((p, i) => expect(p.id).toBe(i));
  });

  it('plots keep 2.2 units apart', () => {
    for (const s of world.sections) {
      const plots = world.plots.filter((p) => p.sectionId === s.id);
      for (let i = 0; i < plots.length; i++) {
        for (let j = i + 1; j < plots.length; j++) {
          const d = angleBetween(plots[i]!.dir, plots[j]!.dir) * LUNA_RADIUS;
          expect(d).toBeGreaterThanOrEqual(PLOT_SPACING * (1 - 1e-6));
        }
      }
    }
  });

  it('deposit richness is in [0.6, 1.6]', () => {
    for (const p of world.plots) {
      if (!p.deposit) continue;
      expect(p.kind).toBe('deposit');
      expect(p.deposit.richness).toBeGreaterThanOrEqual(0.6);
      expect(p.deposit.richness).toBeLessThanOrEqual(1.6);
    }
  });

  it('polar volatiles only at |lat| ≥ 60°', () => {
    for (const p of world.plots.filter((x) => x.deposit?.goodId === 'polarVolatiles')) {
      expect(Math.abs(latLon(p.dir).lat)).toBeGreaterThanOrEqual((60 * Math.PI) / 180 - 1e-9);
    }
  });

  it('founding section is south-polar with regolith, ilmenite and polarVolatiles deposits', () => {
    const s = world.sections[world.foundingSectionId]!;
    expect(latLon(s.center).lat).toBeLessThanOrEqual((-60 * Math.PI) / 180);
    const goods = world.plots
      .filter((p) => p.sectionId === s.id && p.deposit)
      .map((p) => p.deposit!.goodId);
    for (const g of ['regolith', 'ilmenite', 'polarVolatiles']) expect(goods).toContain(g);
  });

  it('is deterministic and seed-sensitive', () => {
    expect(hashState(generateLuna(42))).toBe(hashState(world));
    expect(hashState(generateLuna(43))).not.toBe(hashState(world));
  });

  it('generateLuna runs in < 1500 ms', () => {
    const t0 = performance.now();
    generateLuna(44);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

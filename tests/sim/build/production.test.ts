import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import { sectionState, storageCapKg } from '../../../src/sim/build/sections';
import { totalKg } from '../../../src/sim/inventory';
import type { Building, GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const ilmenite = world.plots.find((p) => p.sectionId === home && p.deposit?.goodId === 'ilmenite')!;
const richness = ilmenite.deposit!.richness;

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function ready(s: GameState, type: 'mine' | 'smelter'): Building {
  const plot =
    type === 'mine'
      ? ilmenite
      : world.plots.find(
          (p) =>
            p.sectionId === home &&
            p.kind === 'build' &&
            !s.buildings.some((b) => b.plotId === p.id),
        )!;
  applyCommand(s, { t: 'build', plotId: plot.id, type });
  const b = s.buildings.find((x) => x.type === type)!;
  b.status = 'active';
  b.progress = 1;
  return b;
}

const run = (s: GameState, n: number, mode: 'fine' | 'coarse' = 'fine', offlineEfficiency = 1) => {
  for (let i = 0; i < n; i++) step(s, { mode, offlineEfficiency });
};
const produced = (s: GameState, g: 'ilmenite' | 'steel') => s.stats.producedKg[g] ?? 0;

describe('production', () => {
  it('a fully staffed L1 mine makes 6 t × richness in 60 ticks (±1 kg)', () => {
    const s = founded();
    ready(s, 'mine');
    run(s, 60);
    expect(Math.abs(produced(s, 'ilmenite') - 6000 * richness)).toBeLessThanOrEqual(1);
  });

  it('a smelter turns 4 t ilmenite into 1.5 t steel per hour', () => {
    const s = founded();
    const smelter = ready(s, 'smelter');
    smelter.input = { ilmenite: 8000 };
    sectionState(s, home)!.depot.ilmenite = 50_000;
    run(s, 60);
    expect(Math.abs(produced(s, 'steel') - 1500)).toBeLessThanOrEqual(1);
  });

  it('missing inputs scale output down proportionally', () => {
    const s = founded();
    const smelter = ready(s, 'smelter');
    smelter.input = { ilmenite: 2000 };
    run(s, 120);
    expect(Math.abs(produced(s, 'steel') - 750)).toBeLessThanOrEqual(1);
    expect(smelter.input.ilmenite ?? 0).toBeLessThanOrEqual(1);
  });

  it('coarse step matches 60 fine steps within 1%', () => {
    const fine = founded();
    ready(fine, 'mine');
    run(fine, 60);
    const coarse = founded();
    ready(coarse, 'mine');
    run(coarse, 1, 'coarse');
    const a = produced(fine, 'ilmenite');
    expect(Math.abs(produced(coarse, 'ilmenite') - a) / a).toBeLessThan(0.01);
  });

  it('offline efficiency 0.5 halves output', () => {
    const full = founded();
    ready(full, 'mine');
    run(full, 2, 'coarse');
    const half = founded();
    ready(half, 'mine');
    run(half, 2, 'coarse', 0.5);
    expect(produced(half, 'ilmenite') / produced(full, 'ilmenite')).toBeCloseTo(0.5, 2);
  });

  it('full depot jams the out lane and blocks production without losing goods', () => {
    const s = founded();
    const mine = ready(s, 'mine');
    const depot = sectionState(s, home)!.depot;
    depot.regolith = storageCapKg(s, home) - totalKg(depot);
    const total = () =>
      totalKg(depot) +
      totalKg(mine.output) +
      s.belts.reduce((sum, b) => sum + b.out.batches.reduce((a, x) => a + x.kg, 0), 0);
    const start = total();
    run(s, 240);
    expect(mine.status).toBe('blocked');
    expect(s.belts[0]!.out.jammed).toBe(true);
    expect(total() - start).toBe(produced(s, 'ilmenite'));
  });
});

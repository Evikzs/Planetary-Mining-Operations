import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../../src/data/buildings';
import { START_STOCK_T } from '../../../src/data/balance';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import { balance, transfer } from '../../../src/sim/ledger';
import { buyableSections, landPrice } from '../../../src/sim/build/landOffice';
import { sectionState, storageCapKg } from '../../../src/sim/build/sections';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';
import type { Plot } from '../../../src/sim/world/types';

function founded(seed = 42): GameState {
  const s = createGame(seed);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const plotsIn = (sid: number) => world.plots.filter((p) => p.sectionId === sid);
const ilmenitePlot = plotsIn(home).find((p) => p.deposit?.goodId === 'ilmenite')!;
const freeBuildPlot = (s: GameState) =>
  plotsIn(home).find((p) => p.kind === 'build' && !s.buildings.some((b) => b.plotId === p.id))!;

describe('founding charter', () => {
  it('grants the charter section, depot, 4 buildings, LM 250,000 and the starting stock', () => {
    const s = founded();
    expect(s.sections.map((x) => x.id)).toEqual([home]);
    const types = s.buildings.map((b) => b.type).sort();
    expect(types).toEqual(['crewQuarters', 'depot', 'roverGarage', 'solarArray', 'solarArray']);
    expect(s.buildings.every((b) => b.status === 'active')).toBe(true);
    expect(s.buildings.find((b) => b.type === 'depot')?.plotId).toBe(
      world.sections[home]!.hubPlotId,
    );
    expect(balance(s.ledger, 'player')).toBe(25_000_000);
    const depot = sectionState(s, home)!.depot;
    for (const [g, t] of Object.entries(START_STOCK_T))
      expect(depot[g as keyof typeof depot]).toBe(t * 1000);
    expect(storageCapKg(s, home)).toBe(3_000_000);
    expect(sectionState(s, home)!.roadNet!.polylines.length).toBe(4);
  });
});

describe('construction', () => {
  it('builds a mine on an ilmenite plot: −LM 6,000, −20 t prefab, −2 t machinery, constructing', () => {
    const s = founded();
    const depot = sectionState(s, home)!.depot;
    expect(applyCommand(s, { t: 'build', plotId: ilmenitePlot.id, type: 'mine' })).toEqual({
      ok: true,
    });
    expect(balance(s.ledger, 'player')).toBe(25_000_000 - 600_000);
    expect(depot.prefabStructures).toBe(130_000);
    expect(depot.machinery).toBe(10_000);
    const mine = s.buildings.find((b) => b.type === 'mine')!;
    expect(mine.status).toBe('constructing');
    expect(mine.level).toBe(1);
  });

  it('completes after 4 game hours (240 fine ticks) with a buildingCompleted event', () => {
    const s = founded();
    applyCommand(s, { t: 'build', plotId: ilmenitePlot.id, type: 'mine' });
    const mine = s.buildings.find((b) => b.type === 'mine')!;
    let completedAt = -1;
    for (let i = 0; i < 300 && completedAt < 0; i++) {
      for (const e of step(s, { mode: 'fine' })) {
        if (e.t === 'buildingCompleted' && e.buildingId === mine.id) completedAt = s.tick;
      }
    }
    expect(completedAt).toBe(240);
    expect(mine.status).not.toBe('constructing');
  });

  it.each([
    [
      'NOT_OWNED',
      (s: GameState) => ({
        plot: plotsIn((home + 1) % 60).find((p) => p.kind === 'build')!,
        type: 'smelter' as const,
        s,
      }),
    ],
    [
      'PLOT_OCCUPIED',
      (s: GameState) => ({
        plot: world.plots[s.buildings.find((b) => b.type === 'crewQuarters')!.plotId]!,
        type: 'smelter' as const,
        s,
      }),
    ],
    ['WRONG_PLOT_KIND', (s: GameState) => ({ plot: freeBuildPlot(s), type: 'mine' as const, s })],
    ['NO_DEPOSIT_MATCH', (s: GameState) => ({ plot: ilmenitePlot, type: 'iceDrill' as const, s })],
    [
      'INSUFFICIENT_CASH',
      (s: GameState) => {
        transfer(s.ledger, 'player', 'world', 25_000_000 - 100);
        return { plot: ilmenitePlot, type: 'mine' as const, s };
      },
    ],
    [
      'INSUFFICIENT_MATERIALS',
      (s: GameState) => {
        sectionState(s, home)!.depot.prefabStructures = 1000;
        return { plot: ilmenitePlot, type: 'mine' as const, s };
      },
    ],
  ] as const)('rejects with %s and charges nothing', (error, arrange) => {
    const { plot, type, s } = arrange(founded());
    const cash = balance(s.ledger, 'player');
    const stock = { ...sectionState(s, home)!.depot };
    const count = s.buildings.length;
    expect(applyCommand(s, { t: 'build', plotId: plot.id, type })).toEqual({ ok: false, error });
    expect(balance(s.ledger, 'player')).toBe(cash);
    expect(sectionState(s, home)!.depot).toEqual(stock);
    expect(s.buildings).toHaveLength(count);
  });

  it('road-locked plot fails with NO_ROAD_ACCESS and charges nothing', () => {
    const seed = 777;
    const w = worldOf({ seed });
    const s = founded(seed);
    const plot = w.plots.find(
      (p) => p.sectionId === w.foundingSectionId && p.deposit?.goodId === 'ilmenite',
    )!;
    (plot as { dir: Plot['dir'] }).dir = [-plot.dir[0], -plot.dir[1], -plot.dir[2]];
    const cash = balance(s.ledger, 'player');
    const stock = { ...sectionState(s, w.foundingSectionId)!.depot };
    expect(applyCommand(s, { t: 'build', plotId: plot.id, type: 'mine' })).toEqual({
      ok: false,
      error: 'NO_ROAD_ACCESS',
    });
    expect(balance(s.ledger, 'player')).toBe(cash);
    expect(sectionState(s, w.foundingSectionId)!.depot).toEqual(stock);
  });

  it('upgrade 1→2 costs 0.6× build cost and 0.5× build hours', () => {
    const s = founded();
    applyCommand(s, { t: 'build', plotId: ilmenitePlot.id, type: 'mine' });
    for (let i = 0; i < 240; i++) step(s, { mode: 'fine' });
    const mine = s.buildings.find((b) => b.type === 'mine')!;
    const cash = balance(s.ledger, 'player');
    expect(applyCommand(s, { t: 'upgrade', buildingId: mine.id })).toEqual({ ok: true });
    expect(cash - balance(s.ledger, 'player')).toBe(360_000);
    expect(mine.status).toBe('upgrading');
    for (let i = 0; i < 120; i++) step(s, { mode: 'fine' });
    expect(mine.status).not.toBe('upgrading');
    expect(mine.level).toBe(2);
  });

  it('demolish refunds 25% of the build cost; the depot cannot be demolished', () => {
    const s = founded();
    applyCommand(s, { t: 'build', plotId: ilmenitePlot.id, type: 'mine' });
    const mine = s.buildings.find((b) => b.type === 'mine')!;
    const cash = balance(s.ledger, 'player');
    expect(applyCommand(s, { t: 'demolish', buildingId: mine.id })).toEqual({ ok: true });
    expect(balance(s.ledger, 'player') - cash).toBe(BUILDINGS.mine.cost.cents / 4);
    expect(s.buildings.some((b) => b.id === mine.id)).toBe(false);
    const depot = s.buildings.find((b) => b.type === 'depot')!;
    expect(applyCommand(s, { t: 'demolish', buildingId: depot.id })).toEqual({
      ok: false,
      error: 'CANNOT_DEMOLISH',
    });
  });

  it('recipes and priorities are validated', () => {
    const s = founded();
    const plot = freeBuildPlot(s);
    expect(
      applyCommand(s, { t: 'build', plotId: plot.id, type: 'smelter', recipeId: 'water' }),
    ).toEqual({ ok: false, error: 'INVALID_RECIPE' });
    applyCommand(s, { t: 'build', plotId: plot.id, type: 'smelter', recipeId: 'glass' });
    const smelter = s.buildings.find((b) => b.type === 'smelter')!;
    expect(smelter.recipeId).toBe('glass');
    expect(applyCommand(s, { t: 'setRecipe', buildingId: smelter.id, recipeId: 'steel' })).toEqual({
      ok: true,
    });
    expect(applyCommand(s, { t: 'setPriority', buildingId: smelter.id, priority: 'high' })).toEqual(
      { ok: true },
    );
    expect(smelter.priority).toBe('high');
  });
});

describe('land office', () => {
  it('sells adjacent sections at LM 60,000 then LM 96,000', () => {
    const s = founded();
    expect(landPrice(0)).toBe(6_000_000);
    expect(landPrice(1)).toBe(9_600_000);
    const [a, b] = buyableSections(s);
    const cash = balance(s.ledger, 'player');
    expect(applyCommand(s, { t: 'buySection', sectionId: a! })).toEqual({ ok: true });
    expect(cash - balance(s.ledger, 'player')).toBe(6_000_000);
    expect(applyCommand(s, { t: 'buySection', sectionId: b! })).toEqual({ ok: true });
    expect(cash - balance(s.ledger, 'player')).toBe(15_600_000);
    expect(s.buildings.filter((x) => x.type === 'depot')).toHaveLength(3);
    expect(applyCommand(s, { t: 'buySection', sectionId: a! })).toEqual({
      ok: false,
      error: 'ALREADY_OWNED',
    });
  });

  it('refuses sections that are not adjacent', () => {
    const s = founded();
    const owned = new Set(s.sections.map((x) => x.id));
    const far = world.sections.find(
      (x) => !owned.has(x.id) && !x.neighbors.some((n) => owned.has(n)),
    )!;
    expect(applyCommand(s, { t: 'buySection', sectionId: far.id })).toEqual({
      ok: false,
      error: 'NOT_ADJACENT',
    });
  });
});

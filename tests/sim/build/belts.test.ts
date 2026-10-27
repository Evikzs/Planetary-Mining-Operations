import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import type { SimEvent } from '../../../src/sim/events';
import { beltCapacityKgPerTick } from '../../../src/sim/build/belts';
import { sectionState, storageCapKg } from '../../../src/sim/build/sections';
import { totalKg } from '../../../src/sim/inventory';
import type { Building, GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';
import { cratePositions } from '../../../src/shared/lanes';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const ilmenite = world.plots.find((p) => p.sectionId === home && p.deposit?.goodId === 'ilmenite')!;

function withMine(): { s: GameState; mine: Building } {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  applyCommand(s, { t: 'build', plotId: ilmenite.id, type: 'mine' });
  const mine = s.buildings.find((b) => b.type === 'mine')!;
  mine.status = 'active';
  mine.progress = 1;
  return { s, mine };
}

const beltOf = (s: GameState, b: Building) => s.belts.find((x) => x.id === b.beltId)!;
const inTransit = (s: GameState) =>
  s.belts.reduce(
    (sum, b) => sum + [...b.out.batches, ...b.in.batches].reduce((a, x) => a + x.kg, 0),
    0,
  );
const total = (s: GameState, mine: Building) =>
  totalKg(sectionState(s, home)!.depot) + totalKg(mine.output) + totalKg(mine.input) + inTransit(s);

describe('belts', () => {
  it('building a belt building creates a belt to the hub', () => {
    const { s, mine } = withMine();
    const belt = beltOf(s, mine);
    expect(belt.length).toBeGreaterThan(0);
    expect(belt.transitTicks).toBe(Math.ceil(belt.length / 0.5));
    expect(belt.points[0]).toEqual(ilmenite.dir);
  });

  it('a batch arrives exactly transitTicks after entering', () => {
    const { s, mine } = withMine();
    mine.output = { ilmenite: 400 };
    const belt = beltOf(s, mine);
    step(s, { mode: 'fine' });
    const entered = s.tick;
    expect(belt.out.batches).toHaveLength(1);
    const before = sectionState(s, home)!.depot.ilmenite ?? 0;
    while (s.tick < entered + belt.transitTicks - 1) step(s, { mode: 'fine' });
    expect(sectionState(s, home)!.depot.ilmenite ?? 0).toBe(before);
    step(s, { mode: 'fine' });
    expect(sectionState(s, home)!.depot.ilmenite).toBe(before + 400);
  });

  it('moves at most the per-tick capacity', () => {
    const { s, mine } = withMine();
    mine.output = { ilmenite: 10_000 };
    step(s, { mode: 'fine' });
    expect(beltOf(s, mine).out.batches[0]!.kg).toBe(beltCapacityKgPerTick(1));
    expect(beltCapacityKgPerTick(1)).toBe(500);
  });

  it('jams when the depot is full and stops new entries', () => {
    const { s, mine } = withMine();
    const depot = sectionState(s, home)!.depot;
    depot.regolith = storageCapKg(s, home) - totalKg(depot);
    mine.output = { ilmenite: 1_000_000 };
    const belt = beltOf(s, mine);
    const events: SimEvent[] = [];
    for (let i = 0; i < belt.transitTicks + 20; i++) events.push(...step(s, { mode: 'fine' }));
    expect(belt.out.jammed).toBe(true);
    expect(events.filter((e) => e.t === 'beltJammed')).toHaveLength(1);
    expect(belt.out.batches.length).toBeLessThanOrEqual(belt.transitTicks + 1);
    expect(totalKg(depot)).toBe(storageCapKg(s, home));
  });

  it('conserves goods across 500 ticks without production (fast-check)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200_000 }),
        fc.integer({ min: 0, max: 50_000 }),
        (out, inp) => {
          const { s, mine } = withMine();
          mine.output = out ? { ilmenite: out } : {};
          mine.input = inp ? { steel: inp } : {};
          const t0 = total(s, mine);
          for (let i = 0; i < 500; i++) step(s, { mode: 'fine' });
          expect(total(s, mine)).toBe(t0);
        },
      ),
      { numRuns: 15 },
    );
  });

  it('coarse moves capacity×60 within one step', () => {
    const { s, mine } = withMine();
    mine.output = { ilmenite: 100_000 };
    const before = sectionState(s, home)!.depot.ilmenite ?? 0;
    step(s, { mode: 'coarse' });
    expect((sectionState(s, home)!.depot.ilmenite ?? 0) - before).toBe(30_000);
    expect(mine.output.ilmenite).toBe(70_000);
  });

  it('demolishing returns belt contents to the depot', () => {
    const { s, mine } = withMine();
    mine.output = { ilmenite: 2000 };
    for (let i = 0; i < 3; i++) step(s, { mode: 'fine' });
    const t0 = total(s, mine);
    applyCommand(s, { t: 'demolish', buildingId: mine.id });
    expect(s.belts).toHaveLength(0);
    expect(totalKg(sectionState(s, home)!.depot)).toBe(t0);
  });
});

describe('cratePositions', () => {
  it('is monotonic, within [0,length] and respects jam spacing', () => {
    const lane = { batches: [0, 1, 2, 3, 4].map((t) => ({ enterTick: t })), jammed: true };
    const pos = cratePositions(lane, 50, 10, 5, 0.5);
    for (const p of pos) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(5);
    }
    for (let i = 1; i < pos.length; i++)
      expect(pos[i - 1]! - pos[i]!).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(pos[0]).toBe(5);
  });

  it('places a fresh batch along the belt by elapsed time', () => {
    const pos = cratePositions({ batches: [{ enterTick: 10 }], jammed: false }, 15, 10, 5, 0.5);
    expect(pos[0]).toBeCloseTo(2.5, 9);
  });
});

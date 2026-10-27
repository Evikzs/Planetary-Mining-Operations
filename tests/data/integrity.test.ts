import { describe, expect, it } from 'vitest';
import {
  levelBuses,
  levelJobs,
  levelOutput,
  levelPower,
  MAX_LEVEL,
  upgradeCost,
  upgradeHours,
} from '../../src/data/balance';
import { BUILDINGS, RECIPES } from '../../src/data/buildings';
import { GOOD_IDS, GOODS, type GoodId } from '../../src/data/goods';
import { FIRST_NAMES, LAST_NAMES } from '../../src/data/names';
import { RAW_GOODS } from '../../src/sim/world/types';

const value = (amounts: Partial<Record<GoodId, number>>) =>
  Object.entries(amounts).reduce((sum, [g, t]) => sum + GOODS[g as GoodId].basePriceCents * t, 0);

describe('data integrity', () => {
  it('has 22 goods with positive prices and volumes', () => {
    expect(GOOD_IDS).toHaveLength(22);
    for (const id of GOOD_IDS) {
      expect(GOODS[id].id).toBe(id);
      expect(GOODS[id].basePriceCents).toBeGreaterThan(0);
      expect(GOODS[id].npc.volumeTph).toBeGreaterThan(0);
    }
  });

  it('every recipe good exists and every building recipe exists', () => {
    for (const r of Object.values(RECIPES)) {
      for (const g of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) {
        expect(GOOD_IDS).toContain(g);
      }
    }
    for (const b of Object.values(BUILDINGS)) {
      for (const r of b.recipes) expect(RECIPES[r]).toBeDefined();
      for (const g of Object.keys(b.cost.materials)) expect(GOOD_IDS).toContain(g);
    }
  });

  it('every recipe adds value at base prices', () => {
    for (const r of Object.values(RECIPES)) {
      expect(value(r.outputs), r.id).toBeGreaterThan(value(r.inputs));
    }
  });

  it('deposit buildings only list raw goods and extract something', () => {
    for (const b of Object.values(BUILDINGS)) {
      if (b.plot !== 'deposit') continue;
      expect(b.depositGoods.length).toBeGreaterThan(0);
      for (const g of b.depositGoods) expect(RAW_GOODS).toContain(g);
      expect(b.extractTph).toBeGreaterThan(0);
    }
  });

  it('pins level scaling', () => {
    expect(levelOutput(1)).toBe(1);
    expect(levelOutput(10)).toBeCloseTo(4.15, 9);
    expect(levelJobs(10, 6)).toBe(20);
    expect(levelJobs(1, 6)).toBe(6);
    expect(levelPower(10)).toBeCloseTo(3.7, 9);
    expect(levelBuses(1)).toBe(4);
    expect(MAX_LEVEL).toBe(10);
    expect(upgradeCost(BUILDINGS.mine, 1)).toEqual({
      cents: 360_000,
      materials: { prefabStructures: 12, machinery: 1.2 },
    });
    expect(upgradeHours(BUILDINGS.mine, 1)).toBe(2);
  });

  it('has 160 unique first and last names', () => {
    expect(FIRST_NAMES).toHaveLength(160);
    expect(LAST_NAMES).toHaveLength(160);
    expect(new Set(FIRST_NAMES).size).toBe(160);
    expect(new Set(LAST_NAMES).size).toBe(160);
  });
});

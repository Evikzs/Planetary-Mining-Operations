import { describe, expect, it } from 'vitest';
import { BUILDING_IDS, BUILDINGS } from '../../src/data/buildings';
import { CODEX } from '../../src/data/codex';
import { NARRATOR_LINES } from '../../src/data/companions/narrator';
import { VETERAN_LINES } from '../../src/data/companions/veteran';
import { GOOD_IDS } from '../../src/data/goods';
import { BEAT_IDS, BEATS } from '../../src/sim/story/beats';

const words = (text: string) => text.trim().split(/\s+/).length;

describe('companion lines', () => {
  it('every BeatId has 2–6 veteran lines ≤ 220 chars and a narrator line', () => {
    for (const id of BEAT_IDS) {
      const lines = VETERAN_LINES[id];
      expect(lines.length, id).toBeGreaterThanOrEqual(2);
      expect(lines.length, id).toBeLessThanOrEqual(6);
      for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(220);
      expect(NARRATOR_LINES[id].length, id).toBeGreaterThanOrEqual(1);
    }
  });

  it('founding lines match the pinned copy', () => {
    expect(VETERAN_LINES['ch1.founding'].slice(0, 2)).toEqual([
      "Name's Ox Varga. Thirty years cutting rock in the Belt, and now I run your operations. Welcome to the Moon, boss.",
      'This is the founding charter: one section near the south pole. Ice in the shadows, iron in the dirt, and a lot of nothing in between.',
    ]);
  });

  it('the veteran never breaks the fourth wall', () => {
    for (const line of Object.values(VETERAN_LINES).flat()) {
      expect(line).not.toMatch(/\b(click|tap|button|screen|game|player|menu|UI)\b/i);
    }
  });
});

describe('codex', () => {
  it('every codex id referenced by beats exists; bodies ≤ 80 words', () => {
    for (const beat of Object.values(BEATS)) {
      for (const id of beat.codex) expect(CODEX[id], id).toBeDefined();
    }
    for (const [id, entry] of Object.entries(CODEX)) {
      expect(words(entry.body), id).toBeLessThanOrEqual(80);
      if (entry.category === 'concepts') {
        expect(entry.realWorld, id).toBeDefined();
        expect(words(entry.realWorld!), id).toBeLessThanOrEqual(60);
      }
    }
  });

  it('covers every good, every buildable building and both contract types', () => {
    for (const g of GOOD_IDS) expect(CODEX[`good.${g}`], g).toBeDefined();
    for (const t of BUILDING_IDS) {
      const buildable = BUILDINGS[t].plot === 'deposit' || BUILDINGS[t].plot === 'build';
      expect(CODEX[`building.${t}`] !== undefined, t).toBe(buildable);
    }
    expect(CODEX['contract.oreDelivery']).toBeDefined();
    expect(CODEX['contract.infrastructure']).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';
import { NARRATOR_LINES } from '../../../src/data/companions/narrator';
import { VETERAN_LINES } from '../../../src/data/companions/veteran';
import { sectionState } from '../../../src/sim/build/sections';
import { applyCommand, createGame, step } from '../../../src/sim/engine';
import { TUTORIAL } from '../../../src/sim/story/beats';
import { currentLine } from '../../../src/sim/story/story';
import type { GameState } from '../../../src/sim/state';
import { worldOf } from '../../../src/sim/world/luna';

const world = worldOf({ seed: 42 });
const home = world.foundingSectionId;
const freeBuildPlot = (s: GameState) =>
  world.plots.find(
    (p) =>
      p.sectionId === home && p.kind === 'build' && !s.buildings.some((b) => b.plotId === p.id),
  )!;
const deposit = (good: string) =>
  world.plots.find((p) => p.sectionId === home && p.deposit?.goodId === good)!;

function founded(): GameState {
  const s = createGame(42);
  applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
  return s;
}

function run(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) step(s, { mode: 'fine' });
}

function complete(s: GameState, plotId: number, type: 'mine' | 'smelter' | 'electrolysisPlant') {
  expect(applyCommand(s, { t: 'build', plotId, type })).toEqual({ ok: true });
  const b = s.buildings.find((x) => x.plotId === plotId)!;
  b.status = 'active';
  b.progress = 1;
  return b;
}

describe('story', () => {
  it('founding queues ch1.founding first, spoken by Ox Varga', () => {
    const s = founded();
    expect(s.story.queue).toEqual(['ch1.founding']);
    const line = currentLine(s, VETERAN_LINES, NARRATOR_LINES)!;
    expect(line.speaker).toBe('Ox Varga');
    expect(line.lines[0]).toContain('Ox Varga');
  });

  it('tutorial beats fire once and in order', () => {
    const s = founded();
    applyCommand(s, { t: 'storyAck', beatId: 'ch1.founding' });
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.camera']);
    applyCommand(s, { t: 'cameraTaught', panned: true });
    run(s, 1);
    expect(s.story.done).not.toContain('ch1.camera');
    applyCommand(s, { t: 'cameraTaught', zoomed: true });
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.firstMine']);
    applyCommand(s, { t: 'build', plotId: deposit('ilmenite').id, type: 'mine' });
    run(s, 1);
    expect(s.story.queue).toEqual([]);
    const mine = s.buildings.find((b) => b.type === 'mine')!;
    mine.status = 'active';
    mine.progress = 1;
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.belts']);
    applyCommand(s, { t: 'storyAck', beatId: 'ch1.founding' });
    run(s, 1);
    expect(s.story.seen).toEqual(TUTORIAL.slice(0, 4));
  });

  it('ch1.power interrupts on the first brownout', () => {
    const s = founded();
    complete(s, freeBuildPlot(s).id, 'smelter');
    complete(s, freeBuildPlot(s).id, 'electrolysisPlant');
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.power', 'ch1.founding']);
  });

  it('a missing veteran line falls back to the narrator', () => {
    const s = founded();
    expect(currentLine(s, { ...VETERAN_LINES, 'ch1.founding': [] }, NARRATOR_LINES)).toEqual({
      beatId: 'ch1.founding',
      speaker: 'Narrator',
      lines: NARRATOR_LINES['ch1.founding'],
    });
  });

  it('muted categories record beats but show nothing', () => {
    const s = founded();
    applyCommand(s, { t: 'setHintMute', category: 'tutorial', muted: true });
    expect(s.story.queue).toEqual([]);
    expect(s.story.done).toContain('ch1.founding');
    run(s, 1);
    expect(s.story.seen).toContain('ch1.camera');
    expect(currentLine(s, VETERAN_LINES, NARRATOR_LINES)).toBeNull();
    applyCommand(s, { t: 'setHintMute', category: 'tutorial', muted: false });
    expect(s.story.muted).toEqual([]);
  });

  it('first sale unlocks concept.orderBook and concept.priceImpact', () => {
    const s = founded();
    const before = TUTORIAL.slice(0, TUTORIAL.indexOf('ch1.firstSale'));
    s.story.seen = [...before];
    s.story.done = [...before];
    s.story.queue = [];
    run(s, 1);
    expect(s.story.queue).toEqual(['ch1.firstSale']);
    expect(s.story.codex).not.toContain('concept.orderBook');
    sectionState(s, home)!.depot.ilmenite = 1000;
    applyCommand(s, {
      t: 'placeOrder',
      goodId: 'ilmenite',
      side: 'sell',
      kind: 'market',
      qtyKg: 1000,
      sectionId: home,
    });
    run(s, 60);
    expect(s.story.done).toContain('ch1.firstSale');
    expect(s.story.codex).toEqual(
      expect.arrayContaining(['concept.orderBook', 'concept.priceImpact']),
    );
  });

  it('event beats fire at most once per 6 game hours', () => {
    const s = founded();
    const strike = () => s.pendingEvents.push({ t: 'strike', buildingId: 1 });
    strike();
    run(s, 1);
    expect(s.story.queue).toContain('ev.strike');
    applyCommand(s, { t: 'storyAck', beatId: 'ev.strike' });
    strike();
    run(s, 1);
    expect(s.story.queue).not.toContain('ev.strike');
    run(s, 359);
    strike();
    run(s, 1);
    expect(s.story.queue).toContain('ev.strike');
  });

  it('the Codex opens up as goods and buildings appear', () => {
    const s = founded();
    expect(s.story.codex).toEqual(
      expect.arrayContaining(['good.prefabStructures', 'building.solarArray', 'mech.sections']),
    );
    expect(s.story.codex).not.toContain('concept.temporalArbitrage');
  });
});

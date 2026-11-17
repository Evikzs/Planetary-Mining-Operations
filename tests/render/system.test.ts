import { Quaternion, Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { airWord, SOL, starsByDay } from '../../src/render/system/sol';
import { SystemView } from '../../src/render/system/systemView';

describe('Sol', () => {
  it('nine worlds with unique ids; only Luna has ground to go to, and it circles Earth', () => {
    expect(SOL).toHaveLength(9);
    expect(new Set(SOL.map((b) => b.id)).size).toBe(9);
    expect(SOL.filter((b) => b.landable).map((b) => b.id)).toEqual(['luna']);
    expect(SOL.find((b) => b.id === 'luna')!.parent).toBe('earth');
    for (const b of SOL) expect(b.blurb.length).toBeGreaterThan(10);
  });

  it('thick air hides the stars by day; the Moon shows them', () => {
    const earth = SOL.find((b) => b.id === 'earth')!;
    const luna = SOL.find((b) => b.id === 'luna')!;
    expect([airWord(earth), starsByDay(earth)]).toEqual(['Thick', false]);
    expect([airWord(luna), starsByDay(luna)]).toEqual(['None', true]);
  });
});

describe('the system view', () => {
  const run = (view: SystemView, frames: number) => {
    for (let i = 0; i < frames; i++) view.update(50, 10, new Vector3(1, 0, 0));
  };

  it('rises from the Moon, names the worlds in sight, and lands back on Luna', () => {
    let landed = 0;
    const view = new SystemView({
      reducedMotion: false,
      glow: new Texture(),
      onPick: () => undefined,
      onLanded: () => landed++,
    });
    view.setSize(1920, 1080);
    view.rise(new Vector3(0, 0, 500), new Quaternion(), 100, 10, new Vector3(1, 0, 0));
    expect(view.flying).toBe(true);
    // The flight takes 2.6 s: 60 frames of 50 ms are enough.
    run(view, 60);
    expect(view.flying).toBe(false);
    const names = view.marks().map((m) => m.name);
    expect(names).toContain('Luna');
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(view.gauge()).toBeGreaterThanOrEqual(0);
    expect(view.gauge()).toBeLessThanOrEqual(1);
    view.dive();
    run(view, 60);
    expect(landed).toBe(1);
  });

  it('picks the world under a click', () => {
    const view = new SystemView({
      reducedMotion: true,
      glow: new Texture(),
      onPick: () => undefined,
      onLanded: () => undefined,
    });
    view.setSize(1920, 1080);
    view.rise(new Vector3(0, 0, 500), new Quaternion(), 100, 10, new Vector3(1, 0, 0));
    run(view, 3);
    const luna = view.marks().find((m) => m.name === 'Luna')!;
    expect(view.pick(luna.x, luna.y)).toBe(SOL.findIndex((b) => b.id === 'luna'));
  });
});

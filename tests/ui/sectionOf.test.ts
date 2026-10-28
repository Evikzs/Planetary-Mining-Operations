import { describe, expect, it } from 'vitest';
import { sectionOfPick } from '../../src/ui/shell/sectionOf';

const w = { plots: [{ id: 5, sectionId: 3 }], buildings: [{ id: 9, plotId: 5 }] };
const trips = [{ id: 2, sectionId: 4 }];

describe('sectionOfPick', () => {
  it('finds the section of a plot, a building, a section and a bus', () => {
    expect(sectionOfPick({ kind: 'plot', id: 5 }, w, trips)).toBe(3);
    expect(sectionOfPick({ kind: 'building', id: 9 }, w, trips)).toBe(3);
    expect(sectionOfPick({ kind: 'section', id: 7 }, w, trips)).toBe(7);
    expect(sectionOfPick({ kind: 'rover', id: 2 }, w, trips)).toBe(4);
    expect(sectionOfPick({ kind: 'plot', id: 99 }, w, trips)).toBeNull();
    expect(sectionOfPick({ kind: 'rover', id: 99 }, w, trips)).toBeNull();
  });
});

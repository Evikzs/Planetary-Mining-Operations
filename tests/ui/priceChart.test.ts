import { describe, expect, it } from 'vitest';
import { chartPoints } from '../../src/ui/components/PriceChart';

describe('price chart', () => {
  it('maps the history onto the box: oldest left, newest right, highest on top', () => {
    expect(chartPoints([100, 300, 200], 200, 50)).toEqual([
      [0, 50],
      [100, 0],
      [200, 25],
    ]);
  });

  it('draws a flat history across the middle, and one price at the right edge', () => {
    expect(chartPoints([5, 5], 10, 20)).toEqual([
      [0, 10],
      [10, 10],
    ]);
    expect(chartPoints([7], 10, 20)).toEqual([[10, 10]]);
    expect(chartPoints([], 10, 20)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { visibleLayers } from '../../src/render/world/lod';

describe('level of detail', () => {
  it('visibleLayers pins thresholds', () => {
    const all = {
      walkers: true,
      crates: true,
      rovers: true,
      traffic: false,
      plotMarkers: true,
      buildings: true,
    };
    expect(visibleLayers(1.5)).toEqual(all);
    expect(visibleLayers(4)).toEqual({ ...all, walkers: false });
    expect(visibleLayers(8)).toEqual({ ...all, walkers: false, crates: false });
    expect(visibleLayers(29.9)).toEqual({ ...all, walkers: false, crates: false });
    expect(visibleLayers(30)).toEqual({
      walkers: false,
      crates: false,
      rovers: false,
      traffic: true,
      plotMarkers: false,
      buildings: true,
    });
    expect(visibleLayers(60).buildings).toBe(false);
    expect(visibleLayers(59.9).buildings).toBe(true);
  });
});

import { Box3, Color } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ALL_MODEL_KEYS,
  buildModel,
  MODEL_FOOTPRINT,
  scaffoldGeometry,
} from '../../src/render/world/models';
import { bodyAccent, palette } from '../../src/ui/tokens';
import type { BufferGeometry } from 'three';

const TOKENS = [...Object.values(palette), ...Object.values(bodyAccent)].map((hex) =>
  new Color(hex)
    .toArray()
    .map((x) => x.toFixed(4))
    .join(','),
);

function check(g: BufferGeometry) {
  const pos = g.getAttribute('position');
  const color = g.getAttribute('color');
  expect((g.index ? g.index.count : pos.count) / 3).toBeLessThanOrEqual(600);
  for (let i = 0; i < pos.count; i++) {
    expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThanOrEqual(MODEL_FOOTPRINT + 1e-6);
    expect(pos.getY(i)).toBeGreaterThanOrEqual(-1e-6);
    const c = [color.getX(i), color.getY(i), color.getZ(i)].map((x) => x.toFixed(4)).join(',');
    expect(TOKENS).toContain(c);
  }
}

const height = (g: BufferGeometry) =>
  new Box3().setFromBufferAttribute(g.getAttribute('position') as never).max.y;

describe('models', () => {
  it('covers every building type and client asset', () => {
    expect(ALL_MODEL_KEYS).toHaveLength(23);
  });

  it.each(ALL_MODEL_KEYS)('%s: ≤ 600 triangles, footprint ≤ 0.45, y ≥ 0', (key) => {
    check(buildModel(key, 1));
  });

  it('the scaffold keeps to the same rules', () => {
    check(scaffoldGeometry());
  });

  it('level 10 is ≤ 1.45× the level-1 height', () => {
    for (const key of ALL_MODEL_KEYS) {
      const [h1, h10] = [height(buildModel(key, 1)), height(buildModel(key, 10))];
      expect(h10).toBeLessThanOrEqual(1.45 * h1 + 1e-6);
      expect(h10).toBeGreaterThan(h1);
    }
  });
});

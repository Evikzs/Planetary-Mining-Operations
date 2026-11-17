import { Box3, Color, type BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ALL_MODEL_KEYS,
  buildModel,
  craneGeometry,
  MODEL_FOOTPRINT,
  scaffoldGeometry,
} from '../../src/render/world/models';
import { kit } from '../../src/ui/tokens';

// Every paint on a model comes from the kit (glow colours are light, not paint).
const PAINT = Object.values(kit)
  .flatMap((v) => (typeof v === 'string' ? [v] : []))
  .map((hex) =>
    new Color(hex)
      .toArray()
      .map((x) => x.toFixed(4))
      .join(','),
  );

function check(g: BufferGeometry) {
  const pos = g.getAttribute('position');
  const color = g.getAttribute('color');
  expect(g.getAttribute('glow')).toBeDefined();
  expect(g.getAttribute('gid')).toBeDefined();
  expect(pos.count / 3).toBeLessThanOrEqual(1200);
  for (let i = 0; i < pos.count; i++) {
    expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThanOrEqual(MODEL_FOOTPRINT + 1e-6);
    expect(pos.getY(i)).toBeGreaterThanOrEqual(-1e-6);
    const c = [color.getX(i), color.getY(i), color.getZ(i)].map((x) => x.toFixed(4)).join(',');
    expect(PAINT).toContain(c);
  }
}

const height = (g: BufferGeometry) =>
  new Box3().setFromBufferAttribute(g.getAttribute('position') as never).max.y;

describe('models', () => {
  it('covers every building type and client asset', () => {
    expect(ALL_MODEL_KEYS).toHaveLength(23);
  });

  it.each(ALL_MODEL_KEYS)('%s: ≤ 1200 triangles, kit paint, footprint ≤ 18 m, y ≥ 0', (key) => {
    check(buildModel(key, 1));
  });

  it('the scaffold and the crane keep to the same rules', () => {
    check(scaffoldGeometry());
    check(craneGeometry());
  });

  it('some windows of the homes can be dark', () => {
    const gid = buildModel('crewQuarters', 1).getAttribute('gid');
    const ids = new Set(Array.from({ length: gid.count }, (_, i) => gid.getX(i)));
    expect(ids.size).toBeGreaterThan(10);
  });

  it('level 10 is ≤ 1.45× the level-1 height', () => {
    for (const key of ALL_MODEL_KEYS) {
      const [h1, h10] = [height(buildModel(key, 1)), height(buildModel(key, 10))];
      expect(h10).toBeLessThanOrEqual(1.45 * h1 + 1e-6);
      expect(h10).toBeGreaterThan(h1);
    }
  });
});

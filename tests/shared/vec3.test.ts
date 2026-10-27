import { describe, expect, it } from 'vitest';
import {
  cross,
  dirToLocal,
  dot,
  fromLatLon,
  latLon,
  len,
  localToDir,
  normalize,
  tangentBasis,
  type Vec3,
} from '../../src/shared/vec3';

const close = (a: Vec3, b: Vec3, eps = 1e-9) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? NaN, -Math.log10(eps)));

describe('vec3', () => {
  it('cross and dot follow the right-hand rule', () => {
    close(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(len(normalize([3, 4, 0]))).toBeCloseTo(1, 12);
  });

  it('tangentBasis is orthonormal with north towards +Y and east to the right', () => {
    const { east, north } = tangentBasis([0, 0, 1]);
    close(north, [0, 1, 0]);
    close(east, [1, 0, 0]);
  });

  it('tangentBasis is orthonormal at the poles', () => {
    for (const pole of [
      [0, 1, 0],
      [0, -1, 0],
    ] as Vec3[]) {
      const { east, north } = tangentBasis(pole);
      expect(len(east)).toBeCloseTo(1, 12);
      expect(len(north)).toBeCloseTo(1, 12);
      expect(dot(east, north)).toBeCloseTo(0, 12);
      expect(dot(east, pole)).toBeCloseTo(0, 12);
    }
  });

  it('lat/lon round-trips', () => {
    const d = fromLatLon(0.4, -2.1);
    const { lat, lon } = latLon(d);
    expect(lat).toBeCloseTo(0.4, 12);
    expect(lon).toBeCloseTo(-2.1, 12);
  });

  it('gnomonic local round-trip', () => {
    const c = normalize([0.3, -0.5, 0.8]);
    const b = tangentBasis(c);
    const back = dirToLocal(c, b, localToDir(c, b, 3, -2, 100), 100);
    expect(back.x).toBeCloseTo(3, 9);
    expect(back.y).toBeCloseTo(-2, 9);
  });
});

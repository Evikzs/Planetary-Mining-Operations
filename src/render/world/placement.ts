import { Matrix4, Quaternion, Vector3 } from 'three';
import { cyrb53 } from '../../sim/hash';
import type { Terrain } from '../../shared/terrain';
import { add, cross, scale, tangentBasis, type Vec3 } from '../../shared/vec3';

/** Each plot's model turns by a fixed angle seeded from its id. */
export const plotYaw = (plotId: number): number =>
  ((cyrb53(`plot${plotId}`) % 3600) / 3600) * 2 * Math.PI;

/**
 * Stands a model on the terrain at dir: local y is up, turned by yaw about it,
 * lifted by `lift`, and stretched to `heightScale` along y.
 */
export function standAt(
  dir: Vec3,
  radius: number,
  terrain: Terrain,
  yaw: number,
  out: Matrix4,
  lift = 0,
  heightScale = 1,
): Matrix4 {
  const { east, north } = tangentBasis(dir);
  const x = add(scale(east, Math.cos(yaw)), scale(north, Math.sin(yaw)));
  const z = cross(x, dir);
  const q = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(new Vector3(...x), new Vector3(...dir), new Vector3(...z)),
  );
  const r = radius + terrain.height(dir) + lift;
  return out.compose(
    new Vector3(dir[0] * r, dir[1] * r, dir[2] * r),
    q,
    new Vector3(1, heightScale, 1),
  );
}

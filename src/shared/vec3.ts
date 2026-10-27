export type Vec3 = readonly [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(len(cross(a, b)), dot(a, b));
}

/** Local east/north at a surface direction. North points towards +Y; at the poles east = +X. */
export function tangentBasis(dir: Vec3): { east: Vec3; north: Vec3 } {
  const up: Vec3 = [0, 1, 0];
  const n = sub(up, scale(dir, dot(dir, up)));
  if (len(n) < 1e-9) {
    const east = normalize(sub([1, 0, 0], scale(dir, dir[0])));
    return { east, north: cross(dir, east) };
  }
  const north = normalize(n);
  return { east: cross(north, dir), north };
}

/** Gnomonic projection from local tangent-plane coordinates (world units) to a unit direction. */
export function localToDir(
  center: Vec3,
  basis: { east: Vec3; north: Vec3 },
  x: number,
  y: number,
  radius: number,
): Vec3 {
  return normalize(add(center, add(scale(basis.east, x / radius), scale(basis.north, y / radius))));
}

export function dirToLocal(
  center: Vec3,
  basis: { east: Vec3; north: Vec3 },
  dir: Vec3,
  radius: number,
): { x: number; y: number } {
  const onPlane = sub(scale(dir, 1 / dot(dir, center)), center);
  return { x: radius * dot(onPlane, basis.east), y: radius * dot(onPlane, basis.north) };
}

export function latLon(dir: Vec3): { lat: number; lon: number } {
  return { lat: Math.asin(Math.max(-1, Math.min(1, dir[1]))), lon: Math.atan2(dir[0], dir[2]) };
}

export function fromLatLon(lat: number, lon: number): Vec3 {
  const c = Math.cos(lat);
  return [c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon)];
}

/** n roughly even points on the unit sphere. */
export function fibonacciSphere(n: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r] as Vec3;
  });
}

// The settlement on a world: ground, buildings, belts, buses, people and ore.
// Town coordinates: x = east, z = south, in metres from the town centre. frame.* bends them onto the sphere.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE, SURFACE } from './glsl.js';
import { KIT as K } from './theme.js';
import { surfaceDir, glowTexture } from './bodies.js';

const TAU = Math.PI * 2, Y = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

// radius: edge of the detailed ground. solid: where its edge starts to fade. cut: hole in the globe. town: how far the camera may walk.
export const PATCH = { radius: 1500, solid: 1150, cut: 1100, town: 520 };
const PIT = { x: -300, z: 60, r: 130, depth: 46 };

// ---------- small tools ----------

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(ix, iz, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise2(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function fbm2(x, z, s) {
  let a = 0.5, sum = 0;
  for (let i = 0; i < 4; i++) { sum += a * noise2(x, z, s + i); x *= 2.03; z *= 2.03; a *= 0.5; }
  return sum / 0.9375;
}

function makeHeight(seed) {
  const mounds = [[-360, -150, 26, 46], [-452, -36, 17, 38]]; // spoil heaps: x, z, height, spread
  return (x, z) => {
    const r = Math.hypot(x, z);
    let h = 0;
    const hill = smooth(520, 800, r) * (1 - smooth(900, 1140, r));
    if (hill > 0) h += hill * Math.max(0, fbm2(x * 0.0042, z * 0.0042, seed) - 0.38) * 260;
    for (const [mx, mz, mh, ms] of mounds) { const d2 = ((x - mx) ** 2 + (z - mz) ** 2) / (ms * ms); if (d2 < 9) h += mh * Math.exp(-d2); }
    const dp = Math.hypot(x - PIT.x, z - PIT.z);
    if (dp < PIT.r) { const t = (1 - dp / PIT.r) * 6, k = Math.floor(t); h = -PIT.depth * Math.min(1, ((k + smooth(0.55, 1, t - k)) / 6) * 1.3); }
    return h;
  };
}

// Town coordinates to colony-local 3D. The ground is a sphere of radius R with its top at the origin.
function makeFrame(R) {
  const q = new THREE.Quaternion(), qh = new THREE.Quaternion(), u = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const f = {
    pos(x, z, h = 0, out = new THREE.Vector3()) { const r = Math.hypot(x, z) || 1e-6, a = r / R, k = (Math.sin(a) / r) * (R + h); return out.set(x * k, Math.cos(a) * (R + h) - R, z * k); },
    up(x, z, out = new THREE.Vector3()) { const r = Math.hypot(x, z) || 1e-6, a = r / R, k = Math.sin(a) / r; return out.set(x * k, Math.cos(a), z * k); },
    matrix(x, z, h, heading, out, sx = 1, sy = sx, sz = sx) {
      q.setFromUnitVectors(Y, f.up(x, z, u)).multiply(qh.setFromAxisAngle(Y, heading));
      return out.compose(f.pos(x, z, h, p), q, s.set(sx, sy, sz));
    },
  };
  return f;
}

// Fixed-radius corners, then lookup by distance along the line.
function makePath(points, closed = false, rad = 9) {
  const n = points.length;
  let pts = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (!closed && (i === 0 || i === n - 1)) { pts.push(p); continue; }
    const a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(rad, la / 2) / la, rb = Math.min(rad, lb / 2) / lb;
    const A = [p[0] + (a[0] - p[0]) * ra, p[1] + (a[1] - p[1]) * ra], B = [p[0] + (b[0] - p[0]) * rb, p[1] + (b[1] - p[1]) * rb];
    for (let k = 0; k <= 4; k++) { const t = k / 4, v = 1 - t; pts.push([v * v * A[0] + 2 * v * t * p[0] + t * t * B[0], v * v * A[1] + 2 * v * t * p[1] + t * t * B[1]]); }
  }
  if (closed) pts.push(pts[0]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  return {
    total, closed,
    at(s, out) {
      s = closed ? ((s % total) + total) % total : Math.min(Math.max(s, 0), total);
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
      const a = pts[lo], b = pts[hi], len = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / len;
      out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
      out.dx = (b[0] - a[0]) / len; out.dz = (b[1] - a[1]) / len;
      return out;
    },
  };
}

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

// ---------- the kit: low-poly parts with paint and night glow ----------

const _c = new THREE.Color(), _e = new THREE.Euler(), _m = new THREE.Matrix4();

function paint(geo, color, glow, gid = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, col = new Float32Array(n * 3), gl = new Float32Array(n * 3);
  _c.set(color); for (let i = 0; i < n; i++) _c.toArray(col, i * 3);
  if (glow) { _c.set(glow[0]).multiplyScalar(glow[1]); for (let i = 0; i < n; i++) _c.toArray(gl, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(gl, 3));
  g.setAttribute('gid', new THREE.BufferAttribute(new Float32Array(n).fill(gid), 1)); // gid > 0: a window that can be dark
  return g;
}
const put = (g, x, y, z, o = {}) => g.applyMatrix4(_m.makeRotationFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0)).setPosition(x, y, z));
// y is the height of the base.
const box = (w, h, d, x, y, z, color, o = {}) => put(paint(new THREE.BoxGeometry(w, h, d), color, o.glow, o.gid), x, y + h / 2, z, o);
const cyl = (rt, rb, h, seg, x, y, z, color, o = {}) => put(paint(new THREE.CylinderGeometry(rt, rb, h, seg), color, o.glow, o.gid), x, y + h / 2, z, o);
const half = (r, seg, x, y, z, color, o = {}) => put(paint(new THREE.SphereGeometry(r, seg, 5, 0, TAU, 0, Math.PI / 2), color, o.glow, o.gid), x, y, z, o);

const MODELS = {
  hab(floors) {
    const H = 3.1, p = [box(14, 0.6, 9, 0, 0, 0, K.steelDark)];
    for (let f = 0; f < floors; f++) {
      const y = 0.6 + f * H, inset = f % 2 ? 0.5 : 0;
      p.push(box(14 - inset, H - 0.15, 9 - inset, 0, y, 0, f % 2 ? K.ceramicDark : K.ceramic));
      for (const side of [-1, 1]) for (let w = 0; w < 4; w++)
        p.push(box(2.2, 1.2, 0.2, -5.1 + w * 3.4, y + 1.1, side * (4.5 - inset / 2), K.glass, { glow: K.glowWindow, gid: 1 + f * 8 + w + (side > 0 ? 4 : 0) }));
    }
    const top = 0.6 + floors * H;
    p.push(box(14.3, 0.25, 9.3, 0, top - 0.1, 0, K.roof), box(3, 1.1, 2.4, -3.5, top + 0.15, 1, K.steel), box(0.15, 4, 0.15, 5, top, -2.5, K.steelDark), box(1.6, 2.3, 0.25, 4.6, 0.6, 4.55, K.orange));
    return mergeGeometries(p);
  },
  dome() {
    return mergeGeometries([cyl(11.4, 11.8, 1.2, 18, 0, 0, 0, K.steel), half(11, 14, 0, 1.2, 0, '#7fb8a2', { glow: ['#63e0b0', 0.5] }), box(4, 3, 3.5, 0, 0, 11.5, K.ceramic), box(1.4, 2.1, 0.2, 0, 0, 13.3, K.orange)]);
  },
  headframe() {
    const p = [box(9, 5, 7, -11, 0, 0, K.ceramicDark), box(9.4, 0.4, 7.4, -11, 5, 0, K.steelDark)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(0.7, 34, 0.7, sx * 3.4, 0, sz * 3.4, K.rust, { rz: sx * 0.085, rx: -sz * 0.085 }));
    for (const y of [9, 18, 27]) p.push(box(7.6 - y * 0.16, 0.4, 7.6 - y * 0.16, 0, y, 0, K.steelDark));
    p.push(box(5, 0.5, 5, 0, 33, 0, K.steelDark));
    for (const z of [-1.2, 1.2]) p.push(cyl(2.6, 2.6, 0.35, 14, 0, 36, z, K.orange, { rx: Math.PI / 2 }), box(0.2, 33, 0.2, -5.4, 3.6, z, K.steelDark, { rz: -0.32 }));
    p.push(box(0.9, 0.5, 0.9, 0, 32.3, 2.6, K.steelDark, { glow: K.glowWork }));
    return mergeGeometries(p);
  },
  plant() {
    const p = [box(46, 13, 22, 0, 0, 0, K.ceramicDark), box(46.4, 1.2, 22.4, 0, 0, 0, K.steelDark)];
    for (let i = 0; i < 4; i++) {
      const x = -17.25 + i * 11.5;
      p.push(box(12.2, 0.5, 22.2, x, 14.6, 0, K.roof, { rz: 0.3 }), box(0.3, 3.2, 21, x + 5.6, 13, 0, K.glass, { glow: K.glowWindow, gid: i + 1 }));
    }
    p.push(cyl(1.6, 2.1, 30, 10, -14, 13, -6, K.rust), cyl(1.75, 1.75, 1.4, 10, -14, 40, -6, K.orange), cyl(1.3, 1.8, 24, 10, -7, 13, 6, K.rust), cyl(1.45, 1.45, 1.2, 10, -7, 34.6, 6, K.orange));
    p.push(cyl(4, 4, 11, 12, 28, 0, 6, K.steel), cyl(4, 4, 11, 12, 28, 0, -5, K.steel), box(8, 20, 8, -27, 0, 2, K.steelDark), box(9.5, 1.2, 9.5, -27, 20, 2, K.orange));
    p.push(box(5, 4, 0.3, 6, 1.2, 11.1, '#2a1a12', { glow: K.glowFurnace }));
    for (const x of [-18, -4, 14]) p.push(box(1.4, 0.5, 0.5, x, 11.5, 11.3, K.steelDark, { glow: K.glowWork }));
    return mergeGeometries(p);
  },
  silo() {
    const p = [box(30, 0.5, 4, 0, 20.2, 0, K.steelDark), box(0.5, 20, 0.5, 15, 0, 2.2, K.orange)];
    for (const x of [-10, 0, 10]) p.push(cyl(4.6, 4.6, 20, 12, x, 0, 0, K.ceramic), cyl(0.6, 4.6, 3.6, 12, x, 20, 0, K.steel), cyl(4.7, 4.7, 0.8, 12, x, 14, 0, K.rust));
    p.push(box(1.2, 0.4, 0.4, -5, 19.6, 2.4, K.steelDark, { glow: K.glowWork }));
    return mergeGeometries(p);
  },
  warehouse() {
    const roof = paint(new THREE.CylinderGeometry(8.2, 8.2, 30, 10, 1, false, 0, Math.PI).scale(0.5, 1, 1), K.roof);
    return mergeGeometries([box(30, 7, 16, 0, 0, 0, K.ceramicDark), put(roof, 0, 7, 0, { rz: Math.PI / 2 }), box(0.3, 5.5, 8, 15.1, 0, 0, K.orange), box(0.3, 0.5, 9, 15.2, 6, 0, K.steelDark, { glow: K.glowWork })]);
  },
  hall() {
    const p = [box(20, 7, 12, 0, 0, 0, K.ceramic), box(20.6, 0.5, 12.6, 0, 7, 0, K.roof), box(20.7, 0.6, 12.7, 0, 6.2, 0, K.ochre), box(5, 14, 5, -6, 0, -1, K.ceramicDark), box(5.6, 0.5, 5.6, -6, 14, -1, K.ochre)];
    for (let w = 0; w < 5; w++) p.push(box(2.4, 3, 0.2, -6.4 + w * 3.4, 2, 6.05, K.glass, { glow: K.glowWindow }));
    p.push(box(3.4, 3.4, 0.2, -6, 9.4, 1.55, '#2a2620', { glow: ['#ffd28a', 1.2] }));
    return mergeGeometries(p);
  },
  solar() {
    return mergeGeometries([box(12, 0.25, 5.4, 0, 2.6, 0, '#172338', { rx: 0.45 }), box(12.3, 0.12, 0.2, 0, 3.86, -2.45, K.steel), box(0.3, 2.8, 0.3, -4, 0, 0, K.steelDark), box(0.3, 2.8, 0.3, 4, 0, 0, K.steelDark)]);
  },
  reactor() {
    const p = [cyl(13, 14, 7, 16, 0, 0, 0, K.ceramicDark), half(11, 14, 0, 7, 0, K.ceramic), cyl(13.3, 13.3, 0.5, 16, 0, 5.6, 0, K.steelDark, { glow: K.glowCool })];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; p.push(box(7, 9, 0.8, Math.cos(a) * 17, 0, Math.sin(a) * 17, K.steel, { ry: -a })); }
    return mergeGeometries(p);
  },
  pad() {
    const p = [cyl(38, 39, 0.8, 24, 0, 0, 0, '#2c2d31'), cyl(30, 30, 0.04, 32, 0, 0.8, 0, K.ochre), cyl(28.6, 28.6, 0.04, 32, 0, 0.83, 0, '#2c2d31'), box(9, 0.04, 1.4, 0, 0.86, 0, K.ochre), box(1.4, 0.04, 9, 0, 0.86, 0, K.ochre)];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; p.push(box(0.6, 0.35, 0.6, Math.cos(a) * 36.5, 0.8, Math.sin(a) * 36.5, K.steelDark, { glow: K.glowCool })); }
    return mergeGeometries(p);
  },
  shuttle() {
    const p = [cyl(2.6, 3.4, 13, 10, 0, 3.4, 0, K.ceramic), cyl(0.4, 2.6, 5, 10, 0, 16.4, 0, K.orange), cyl(1.6, 2.3, 1.8, 10, 0, 1.6, 0, K.steelDark), cyl(3.45, 3.45, 1, 10, 0, 7, 0, K.ochre), box(1.2, 1, 0.3, 0, 13, 2.75, K.glass, { glow: K.glowCool })];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78; p.push(box(0.5, 6.5, 0.5, Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4, K.steel, { rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 })); }
    return mergeGeometries(p);
  },
  mast() {
    return mergeGeometries([cyl(0.3, 1.2, 60, 4, 0, 0, 0, K.rust), box(5, 3, 4, 3.5, 0, 0, K.ceramicDark), cyl(2.3, 0.4, 1, 10, 0.9, 43, 0, K.ceramic, { rz: -Math.PI / 2 }), cyl(1.6, 0.3, 0.8, 10, 0, 50, 0.8, K.ceramic, { rx: Math.PI / 2 })]);
  },
  lamp() {
    return mergeGeometries([cyl(0.1, 0.15, 7, 5, 0, 0, 0, K.steelDark), box(0.12, 0.12, 1.9, 0, 6.9, 0.9, K.steelDark), box(0.5, 0.16, 0.9, 0, 6.72, 1.6, K.steel, { glow: K.glowWork })]);
  },
  stop() {
    return mergeGeometries([box(6, 0.2, 2.6, 0, 2.6, 0, K.orange), box(6, 2.3, 0.15, 0, 0.3, -1.2, K.glass, { glow: ['#cfe6ff', 0.3] }), box(0.15, 2.6, 0.15, -2.9, 0, 1.1, K.steelDark), box(0.15, 2.6, 0.15, 2.9, 0, 1.1, K.steelDark), box(0.2, 3.6, 0.2, 3.8, 0, 0, K.steelDark), box(1, 1, 0.2, 3.8, 3.6, 0, K.ochre, { glow: K.glowCool })]);
  },
  container() {
    return mergeGeometries([box(6, 2.6, 2.44, 0, 0, 0, '#e8e2d6'), box(0.1, 2.3, 2.1, 3.02, 0.15, 0, '#8d877c')]);
  },
  tank() {
    return mergeGeometries([cyl(2.6, 2.6, 9, 12, 0, 0.9, 0, K.teal, { rz: Math.PI / 2 }), box(0.6, 1.4, 4.4, -3, 0, 0, K.steelDark), box(0.6, 1.4, 4.4, 3, 0, 0, K.steelDark)]);
  },
  crusher() {
    return mergeGeometries([box(12, 14, 12, 0, 0, 0, K.steelDark), box(15, 2.6, 15, 0, 14, 0, K.orange), box(5, 6, 5, 8, 0, 0, K.steel), box(1.4, 0.5, 0.5, 0, 12.5, 6.3, K.steelDark, { glow: K.glowWork }), box(0.5, 0.5, 1.4, 6.3, 12.5, 0, K.steelDark, { glow: K.glowWork })]);
  },
  excavator() {
    return mergeGeometries([box(8, 1.3, 6, 0, 0, 0, K.steelDark), box(7, 4, 5, 0, 1.3, 0, K.ochre), box(2.4, 2.2, 2.4, 1.6, 5.3, 1, K.ochre), box(1.3, 1.3, 15, 0, 6, 8.6, K.steel, { rx: -0.38 }), cyl(3.3, 3.3, 1.3, 10, 0, 7.6, 15.8, K.orange, { rz: Math.PI / 2 }), box(1.2, 0.5, 0.4, 1.6, 6.6, 2.3, K.steelDark, { glow: K.glowWork })]);
  },
  // Vehicles point to +z.
  bus() {
    const p = [box(2.5, 2.4, 9, 0, 0.7, 0, '#d8cdb4'), box(2.56, 0.5, 9.02, 0, 1.25, 0, K.ochre), box(2.7, 0.9, 1.1, 0, 0, 2.8, '#17181b'), box(2.7, 0.9, 1.1, 0, 0, -2.8, '#17181b')];
    for (const s of [-1, 1]) p.push(box(0.1, 0.9, 7.2, s * 1.26, 1.95, -0.3, K.glass, { glow: ['#ffd9a0', 1.0] }), box(0.5, 0.3, 0.1, s * 0.8, 0.95, 4.52, K.steel, { glow: ['#fff1cf', 5] }), box(0.4, 0.25, 0.1, s * 0.9, 1, -4.52, K.steel, { glow: ['#ff3b2f', 2] }));
    return mergeGeometries(p);
  },
  truck() {
    const p = [box(3.4, 1.2, 8, 0, 1, 0, K.steelDark), box(3, 2.4, 2.4, 0, 2.2, 2.6, K.orange), box(2.6, 0.9, 0.1, 0, 3.4, 3.82, K.glass, { glow: ['#ffd9a0', 0.8] }), box(3.6, 2, 5, 0, 2.2, -1.3, K.ochre), box(3, 0.8, 4.2, 0, 4.2, -1.3, '#2b2729'), box(3.8, 1.8, 1.8, 0, 0, 2.4, '#17181b'), box(3.8, 1.8, 1.8, 0, 0, -2.2, '#17181b')];
    for (const s of [-1, 1]) p.push(box(0.5, 0.35, 0.1, s * 1.1, 1.5, 4.02, K.steel, { glow: ['#fff1cf', 5] }));
    return mergeGeometries(p);
  },
  belt() { // one metre of conveyor, stretched along z
    return mergeGeometries([box(1.5, 0.8, 1, 0, -1, 0, K.rust), box(2.2, 0.2, 1, 0, -0.2, 0, '#1b1b1e'), box(0.14, 0.55, 1, -1.1, -0.2, 0, K.orange), box(0.14, 0.55, 1, 1.1, -0.2, 0, K.orange)]);
  },
  pylon() { return box(0.5, 1, 0.5, 0, 0, 0, K.steelDark); },
};

const CATALOG = {
  hab: ['Hab block', 'Homes for crews and their families.'], dome: ['Grow dome', 'Food and air for the town.'],
  headframe: ['Headframe', 'Winds the cage down the main shaft.'], plant: ['Ore mill', 'Crushes and sorts the rock from the pit.'],
  silo: ['Concentrate silos', 'Holds sorted ore until the lifter comes.'], warehouse: ['Stores', 'Parts, tools and dry goods.'],
  hall: ['Assay office', 'Every load is weighed and graded here.'], solar: ['Solar table', 'Power by day.'], reactor: ['Reactor', 'Power by night.'],
  pad: ['Landing pad', 'The lifter takes ore up and brings people down.'], shuttle: ['Ore lifter', 'Makes the run to orbit.'],
  mast: ['Signal mast', 'Talks to orbit.'], stop: ['Bus stop', 'Loop line. A bus comes every few minutes.'], container: ['Ore container', 'Sealed and graded.'],
  tank: ['Water tank', 'Melt water for the domes.'], crusher: ['Primary crusher', 'First stop for rock from the pit.'], excavator: ['Bench excavator', 'Cuts the benches of the pit.'],
};

function kitMaterial(shared, extra) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 glow; attribute float gid; uniform float uNight, uLit, uTime; varying vec3 vGlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float on_ = gid < .5 ? 1. : step(fract(sin((gid + float(gl_InstanceID) * .37) * 91.7) * 43758.5), uLit);
        vGlow = glow * on_ * mix(.05, 1., uNight);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;');
    if (extra) extra(sh);
  };
  return m;
}

// ---------- ground ----------

const STRATA = ['#2a2a30', '#3b383d', '#1f1f25', '#4a444a'].map((h) => new THREE.Color(h));

function buildTerrain(frame, hgt, planet, shared, toPlanet) {
  const ore = planet.uniforms.uOre.value, ground = new THREE.Color(K.ground), spoil = new THREE.Color('#57525c'), c = new THREE.Color();
  const rings = [0];
  let r = 0;
  while (r < 470) rings.push((r += 3.6));
  while (r < PATCH.radius) rings.push((r = Math.min(PATCH.radius, r * 1.035 + 1)));
  const M = 300, n = 1 + (rings.length - 1) * M;
  const pos = new Float32Array(n * 3), over = new Float32Array(n * 4), mix = new Float32Array(n * 2), p = new THREE.Vector3();
  const set = (i, x, z, rr) => {
    const h = hgt(x, z);
    frame.pos(x, z, h, p).toArray(pos, i * 3);
    let a = 0, oreMask = 0;
    if (h < -0.5) { // pit wall: rock layers, with the ore layer open to the light
      const d = -h + fbm2(x * 0.05, z * 0.05, 9) * 5;
      c.copy(STRATA[Math.floor(d / 6.5) % 4]); a = 0.92;
      if (((d > 21 && d < 29) || (d > 37 && d < 43)) && fbm2(x * 0.06, z * 0.06, 3) > 0.4) { c.lerp(ore, 0.7); oreMask = 1; }
    } else if (h > 1.5 && rr < 520) { c.copy(spoil); a = 0.6 * Math.min(1, h / 8); }
    else { c.copy(ground); a = 0.5 * (1 - smooth(400, 500, rr)); }
    over.set([c.r, c.g, c.b, a], i * 4);
    mix[i * 2] = oreMask; mix[i * 2 + 1] = 1 - smooth(PATCH.solid, PATCH.radius, rr);
  };
  set(0, 0, 0, 0);
  for (let j = 1; j < rings.length; j++) for (let k = 0; k < M; k++) { const a = (k / M) * TAU; set(1 + (j - 1) * M + k, rings[j] * Math.cos(a), rings[j] * Math.sin(a), rings[j]); }
  const idx = [];
  for (let k = 0; k < M; k++) idx.push(0, 1 + ((k + 1) % M), 1 + k);
  let solidCount = 0;
  for (let j = 1; j < rings.length - 1; j++) {
    for (let k = 0; k < M; k++) {
      const a = 1 + (j - 1) * M + k, a2 = 1 + (j - 1) * M + ((k + 1) % M), b = a + M, b2 = a2 + M;
      idx.push(a, a2, b, a2, b2, b);
    }
    if (rings[j + 1] <= PATCH.solid + 1) solidCount = idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aOver', new THREE.BufferAttribute(over, 4));
  g.setAttribute('aMix', new THREE.BufferAttribute(mix, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.addGroup(0, solidCount, 0); g.addGroup(solidCount, idx.length - solidCount, 1);
  g.computeVertexNormals();

  const material = (transparent) => {
    const m = new THREE.MeshLambertMaterial({ transparent, depthWrite: !transparent, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    m.onBeforeCompile = (sh) => {
      const u = planet.uniforms;
      Object.assign(sh.uniforms, shared, { uLow: u.uLow, uHigh: u.uHigh, uAccent: u.uAccent, uOre: u.uOre, uSeed: u.uSeed, uGas: u.uGas, uToPlanet: { value: toPlanet } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aOver; attribute vec2 aMix; uniform mat4 uToPlanet; varying vec4 vOver; varying vec2 vMix; varying vec3 vPl;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOver = aOver; vMix = aMix; vPl = (uToPlanet * vec4(position, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec4 vOver; varying vec2 vMix; varying vec3 vPl; uniform float uTime;\n${NOISE}\n${SURFACE}`)
        .replace('#include <color_fragment>', `
          float px_ = max(length(dFdx(vPl)), length(dFdy(vPl))); float vein_, hgt_;
          vec3 alb_ = surfaceAlbedo(vPl, px_, vein_, hgt_);
          diffuseColor.rgb = mix(alb_, vOver.rgb * (.85 + .3 * vnoise(vPl * .9)), vOver.a);
          diffuseColor.a *= vMix.y;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Ore in the rock catches the light. Small, sparse, and it moves when you move.
          float cs_ = exp2(ceil(log2(max(px_ * 2.5, .35))));
          float hs_ = hash13(floor(vPl / cs_));
          float tw_ = pow(.5 + .5 * sin(hs_ * 90. + uTime * 1.7 + dot(normalize(vViewPosition), vec3(9., 5., 7.)) * 4.), 10.);
          totalEmissiveRadiance += uOre * max(vMix.x, vein_ * .6) * (.05 + step(.93, hs_) * tw_ * 2.6);`);
    };
    return m;
  };
  const mesh = new THREE.Mesh(g, [material(false), material(true)]);
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

function buildRoads(frame, hgt, roads) {
  const pos = [], s = {}, p = new THREE.Vector3();
  const v = (pt) => { frame.pos(pt[0], pt[1], hgt(pt[0], pt[1]) + 0.07, p); pos.push(p.x, p.y, p.z); };
  for (const rd of roads) {
    const n = Math.ceil(rd.path.total / 5), hw = rd.w / 2;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      rd.path.at((rd.path.total * i) / n, s);
      const cur = { L: [s.x + s.dz * hw, s.z - s.dx * hw], R: [s.x - s.dz * hw, s.z + s.dx * hw] };
      if (prev) { v(prev.L); v(prev.R); v(cur.L); v(prev.R); v(cur.R); v(cur.L); }
      prev = cur;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: K.road, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- people and ore ----------

function citizenGeometry() {
  const part = (g, tint, limb, pivot) => {
    const n = g.attributes.position.count;
    g.setAttribute('tintMask', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1));
    g.setAttribute('limb', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 2 ? pivot : limb)), 2));
    return g;
  };
  const suit = '#ffffff', p = [];
  for (const s of [-1, 1]) p.push(part(box(0.17, 0.82, 0.2, s * 0.11, 0, 0, '#34373d'), 0, s, 0.82), part(box(0.13, 0.6, 0.15, s * 0.3, 0.82, 0, suit), 1, -s * 0.7, 1.42));
  p.push(part(box(0.44, 0.62, 0.27, 0, 0.82, 0, suit), 1, 0, 0), part(box(0.32, 0.42, 0.16, 0, 0.94, -0.2, '#4a4d52'), 0, 0, 0));
  p.push(part(put(paint(new THREE.SphereGeometry(0.17, 7, 5), '#e6dfd0'), 0, 1.62, 0), 0, 0, 0), part(box(0.22, 0.11, 0.06, 0, 1.58, 0.14, '#10161c', { glow: ['#bfe6ff', 0.9] }), 0, 0, 0));
  return mergeGeometries(p);
}

function crystalGeometry(rnd, ore) {
  const parts = [], gem = (g, v, color) => { const q = paint(g, color); q.setAttribute('gem', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count).fill(v), 1)); return q; };
  parts.push(gem(new THREE.IcosahedronGeometry(1.6, 0).scale(1.3, 0.45, 1.1), 0, '#1d1b1e'));
  for (let i = 0; i < 9; i++) {
    const h = 1.1 + rnd() * rnd() * 4, r = 0.2 + rnd() * 0.32, o = { rx: (rnd() - 0.5) * 0.9, rz: (rnd() - 0.5) * 0.9 };
    const x = (rnd() - 0.5) * 2.2, z = (rnd() - 0.5) * 1.8;
    const shaft = new THREE.CylinderGeometry(r, r * 1.1, h, 6).translate(0, h / 2, 0), tip = new THREE.CylinderGeometry(0, r, r * 2.4, 6).translate(0, h + r * 1.2, 0);
    parts.push(put(gem(shaft, 1, ore), x, 0.2, z, o), put(gem(tip, 1, ore), x, 0.2, z, o));
  }
  return mergeGeometries(parts);
}

const FIRST = ['Mara', 'Ilse', 'Tobin', 'Odile', 'Sefa', 'Jory', 'Wren', 'Halvard', 'Nell', 'Ansel', 'Dag', 'Ivo', 'Lucan', 'Petra', 'Rasmus', 'Tamsin', 'Una', 'Corin', 'Edda', 'Bram'];
const LAST = ['Kestrel', 'Voss', 'Adeyemi', 'Lindqvist', 'Okafor', 'Marchetti', 'Tanaka', 'Brandt', 'Suarez', 'Novak', 'Hale', 'Iyer', 'Dufresne', 'Kowalczyk', 'Reyes', 'Sato'];
const JOBS_PIT = ['Pit crew', 'Blaster', 'Belt fitter', 'Haul driver', 'Shaft hand'];
const JOBS_TOWN = ['Assayer', 'Grower', 'Hab technician', 'Bus driver', 'Teacher', 'Cook', 'Surveyor', 'Medic', 'Storekeeper'];
const THOUGHTS = [
  'Saw the pink seam on bench three today. It never gets old.', 'Double shift. Worth it.', 'The loop bus is late again.',
  'The dome had tomatoes this cycle.', 'Dust in everything. Still better than the transit ship.', 'Wrote home. Told them about the sky here.',
  'Two more cycles and the hab is ours.', 'You stop hearing the belts after a while.', 'Night shift has the best stars.', 'Someone found a crystal as long as an arm.',
];

// ---------- build ----------

export function buildColony(planet) {
  const R = planet.radius, def = planet.def.colony, seed = Math.floor(planet.def.seed * 97);
  const rnd = mulberry(seed), hgt = makeHeight(seed), frame = makeFrame(R);
  const shared = { uTime: { value: 0 }, uNight: { value: 0 }, uLit: { value: 0.6 } };
  const oreColor = planet.uniforms.uOre.value;

  // +x east, +y up, +z south at the site.
  const group = new THREE.Group();
  const U = surfaceDir(def.lat, def.lon), E = new THREE.Vector3(Math.cos(def.lon), 0, -Math.sin(def.lon)), S = new THREE.Vector3().crossVectors(E, U);
  group.matrix.makeBasis(E, U, S).setPosition(U.clone().multiplyScalar(R));
  group.matrixAutoUpdate = false;
  const quat = new THREE.Quaternion().setFromRotationMatrix(group.matrix);

  // --- plan ---
  const rim = []; for (let i = 0; i < 24; i++) rim.push([PIT.x + Math.cos((i / 24) * TAU) * (PIT.r + 12), PIT.z + Math.sin((i / 24) * TAU) * (PIT.r + 12)]);
  const roads = [
    { name: 'Main Street', w: 9, pts: [[-140, 0], [330, 0]], homes: [240, 470] }, // homes: from and to, in metres along the road
    { name: 'Assay Road', w: 9, pts: [[60, -250], [60, 290]], homes: [120, 480] },
    { name: 'Loop', w: 7, pts: [[60, -140], [300, -140], [300, 140], [60, 140]], homes: [0, 760] },
    { name: 'Second', w: 6, pts: [[140, -140], [140, 140]], homes: [0, 280] },
    { name: 'Third', w: 6, pts: [[220, -140], [220, 140]], homes: [0, 280] },
    { name: 'Works Road', w: 7, pts: [[-60, 0], [-60, -235]], work: true },
    { name: 'Pit Gate', w: 8, pts: [[-140, 0], [-162, 26]], work: true },
    { name: 'Rim Road', w: 8, pts: rim, closed: true, work: true },
    { name: 'Pad Road', w: 7, pts: [[60, 290], [92, 300]] },
  ];
  for (const rd of roads) rd.path = makePath(rd.pts, rd.closed);
  const busRoute = makePath([[-118, 0], [60, 0], [60, -140], [300, -140], [300, 140], [60, 140], [60, 0], [-118, 0], [-134, 8], [-143, 0], [-134, -8]], true, 7);
  const stops = [[-112, -8, 0], [40, 8, Math.PI], [180, -148, 0], [308, 0, -Math.PI / 2], [180, 148, Math.PI]];

  const items = {}, taken = []; // taken: [x, z, radius] of ground in use
  const add = (type, x, z, rot = 0, foot = 0, extra) => { (items[type] ||= []).push({ type, x, z, rot, ...extra }); if (foot) taken.push([x, z, foot]); };
  add('hall', 90, 28, 0, 15); add('mast', 82, -27, 0, 7);
  add('plant', -108, -128, 0.25, 30); add('crusher', -166, -28, 0, 12); add('silo', -28, -176, 0, 17);
  add('warehouse', -114, -208, 0, 20); add('warehouse', -104, 46, Math.PI / 2, 20); add('headframe', -150, 152, 0.6, 14);
  add('reactor', -4, -300, 0, 20); add('pad', 130, 322, 0, 46); add('shuttle', 130, 322, 0.4, 0, { lift: 0.8 });
  for (const [x, z] of [[350, -100], [353, -50], [353, 50], [350, 100], [250, 198], [196, 200], [304, 200]]) add('dome', x, z, rnd() * TAU, 14);
  for (let i = 0; i < 3; i++) add('tank', 330 + i * 7, -152, Math.PI / 2, 5);
  for (let x = 96; x <= 312; x += 18) for (let z = -336; z <= -206; z += 13) add('solar', x, z, 0);
  for (const [x, z, rot] of stops) add('stop', x, z, rot, 5);
  for (const [a, d] of [[3.6, 80], [1.0, 59]]) add('excavator', PIT.x + Math.cos(a) * d, PIT.z + Math.sin(a) * d, a + 2.2);
  for (let cx = 0; cx < 3; cx++) for (let cz = 0; cz < 6; cz++) for (let y = 0, top = Math.floor(rnd() * 3.4); y < top; y++)
    add('container', 186 + cx * 7.5, 284 + cz * 3.6, 0, 0, { lift: y * 2.62, tint: [K.rust, K.teal, K.ochre, K.ceramic, K.orange][Math.floor(rnd() * 5)] });

  // Homes along the streets. Taller near the middle of town.
  const blocked = (x, z, rad) =>
    (x > 20 - rad && x < 40 + rad) || // the belt to the pad runs here
    taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + rad) ||
    roads.some((rd) => rd.pts.some((p, i) => (i || rd.closed) && segDist(x, z, rd.pts[(i || rd.pts.length) - 1], p) < rd.w / 2 + rad - 0.5));
  const at = {};
  for (const rd of roads) if (rd.homes) for (let s = rd.homes[0] + 14; s < rd.homes[1] - 10; s += 25) for (const side of [-1, 1]) {
    rd.path.at(s, at);
    const off = rd.w / 2 + 8.5, x = at.x - at.dz * side * off, z = at.z + at.dx * side * off;
    if (rnd() < 0.1 || blocked(x, z, 5.5)) continue;
    const near = Math.hypot(x - 60, z) < 150, floors = near ? [3, 4, 4, 6][Math.floor(rnd() * 4)] : [2, 2, 3, 4][Math.floor(rnd() * 4)];
    const shade = 0.82 + rnd() * 0.22;
    add('hab' + floors, x, z, Math.atan2(-at.dz, at.dx) + (side > 0 ? Math.PI : 0), 8, { label: 'hab', tint: new THREE.Color(shade, shade * (0.96 + rnd() * 0.06), shade * (0.9 + rnd() * 0.1)), floors });
  }

  // Street lamps and the pools of light below them.
  const pools = []; // [x, z, radius, colour, strength]
  const lamp = new THREE.Color(K.glowWork[0]);
  for (const rd of roads) {
    const step = rd.work ? 58 : 36;
    for (let s = step / 2, k = 0; s < rd.path.total; s += step, k++) {
      rd.path.at(s, at);
      const side = k % 2 ? 1 : -1, off = rd.w / 2 + 1, x = at.x - at.dz * side * off, z = at.z + at.dx * side * off;
      if (hgt(x, z) < -0.5) continue;
      add('lamp', x, z, Math.atan2(at.dz * side, -at.dx * side));
      pools.push([x + at.dz * side * 1.6, z - at.dx * side * 1.6, 15, lamp, 0.17]);
    }
  }
  for (const d of items.dome) pools.push([d.x, d.z, 22, new THREE.Color('#63e0b0'), 0.09]);
  for (const s of items.stop) pools.push([s.x, s.z, 7, new THREE.Color('#cfe6ff'), 0.1]);
  pools.push([-108, -112, 44, lamp, 0.13], [-166, -28, 24, lamp, 0.13], [-28, -168, 24, lamp, 0.1], [130, 322, 46, new THREE.Color('#cfe6ff'), 0.07], [-4, -300, 30, new THREE.Color('#cfe6ff'), 0.07], [90, 36, 16, lamp, 0.12], [-150, 152, 20, lamp, 0.12]);

  // --- meshes ---
  const kit = kitMaterial(shared), M4 = new THREE.Matrix4(), pickables = [];
  group.add(buildTerrain(frame, hgt, planet, shared, group.matrix), buildRoads(frame, hgt, roads));

  const geos = {};
  for (const type of Object.keys(items)) {
    const list = items[type], floors = type.startsWith('hab') ? +type.slice(3) : 0;
    const mesh = new THREE.InstancedMesh((geos[type] = floors ? MODELS.hab(floors) : MODELS[type]()), kit, list.length);
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, frame.matrix(it.x, it.z, hgt(it.x, it.z) + (it.lift || 0), it.rot, M4));
      if (it.tint) mesh.setColorAt(i, _c.set(it.tint));
    });
    mesh.castShadow = type !== 'lamp'; mesh.receiveShadow = true;
    mesh.userData = { kind: 'building', type: list[0].label || type, items: list };
    if (type !== 'lamp' && type !== 'solar') pickables.push(mesh);
    group.add(mesh);
  }

  // Belts: pit to crusher to mill to silos to the pad. [x, z, height above ground]
  const lines = [
    [[-286, 72, 1.5], [-166, -28, 16.6]], [[-166, -28, 16.6], [-133.7, -119.4, 21.5]], [[-87.7, -137.3, 14], [-28, -176, 24]],
    [[-16, -170, 7], [30, -110, 8], [30, 236, 8], [84, 296, 6]],
  ];
  const segs = [], pyl = [], a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), up = new THREE.Vector3(), xa = new THREE.Vector3(), za = new THREE.Vector3();
  let beltLen = 0;
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const [x1, z1, e1] = line[i - 1], [x2, z2, e2] = line[i];
    frame.pos(x1, z1, hgt(x1, z1) + e1, a3); frame.pos(x2, z2, hgt(x2, z2) + e2, b3);
    const len = a3.distanceTo(b3);
    frame.up((x1 + x2) / 2, (z1 + z2) / 2, up); za.subVectors(b3, a3).normalize(); xa.crossVectors(up, za).normalize(); up.crossVectors(za, xa);
    segs.push({ a: a3.clone(), b: b3.clone(), up: up.clone(), len, start: beltLen, m: new THREE.Matrix4().makeBasis(xa, up, za).scale(new THREE.Vector3(1, 1, len)).setPosition(a3.clone().lerp(b3, 0.5)) });
    beltLen += len;
    for (let d = 12; d < len - 4; d += 22) {
      const t = d / len, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, top = a3.clone().lerp(b3, t), base = frame.pos(x, z, hgt(x, z));
      pyl.push(frame.matrix(x, z, hgt(x, z), 0, new THREE.Matrix4(), 1, Math.max(0.1, top.distanceTo(base) - 1.2), 1));
    }
  }
  const belts = new THREE.InstancedMesh(MODELS.belt(), kit, segs.length), pylons = new THREE.InstancedMesh(MODELS.pylon(), kit, pyl.length);
  segs.forEach((s, i) => belts.setMatrixAt(i, s.m)); pyl.forEach((m, i) => pylons.setMatrixAt(i, m));
  belts.castShadow = pylons.castShadow = true;
  belts.userData = { kind: 'building', type: 'belt', items: segs.map(() => ({ type: 'belt' })) };
  pickables.push(belts);
  const lumpCount = Math.floor(beltLen / 3.2);
  const rockLumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshLambertMaterial({ color: '#2a2628', flatShading: true }), lumpCount);
  const oreLumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshLambertMaterial({ color: oreColor, emissive: oreColor, emissiveIntensity: 0.7, flatShading: true }), Math.ceil(lumpCount / 7));
  group.add(belts, pylons, rockLumps, oreLumps);

  // Ore: crystal clusters. The first one found stands near town.
  const seams = [[-40, 196, 1.5, 'The first seam'], [PIT.x + 84, PIT.z + 58, 1.2, 'Bench one seam'], [PIT.x - 51, PIT.z + 30, 1.3, 'Bench three seam'], [PIT.x - 9, PIT.z - 80, 1.0, 'Bench two seam'], [PIT.x - 8, PIT.z + 12, 1.6, 'Pit floor seam'],
    [420, -230, 1.4, 'East outcrop'], [-520, -300, 1.7, 'Far ridge outcrop'], [240, 430, 1.2, 'South outcrop'], [-190, 330, 1.3, 'Low field outcrop']];
  const crystalMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  crystalMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, { uOre: planet.uniforms.uOre });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float gem; varying float vGem;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGem = gem;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGem; uniform float uTime; uniform vec3 uOre;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float g_ = pow(abs(dot(normal, normalize(normalize(vViewPosition) + vec3(.3, .6, .2)))), 22.) + .5 * pow(.5 + .5 * sin(uTime * 2.1 + normal.x * 37. + normal.y * 71.), 14.);
        totalEmissiveRadiance += uOre * vGem * (.2 + 2.4 * g_);`);
  };
  const crystals = new THREE.InstancedMesh(crystalGeometry(rnd, oreColor), crystalMat, seams.length);
  seams.forEach(([x, z, s], i) => { crystals.setMatrixAt(i, frame.matrix(x, z, hgt(x, z) - 0.2, rnd() * TAU, M4, s)); pools.push([x, z, 9 * s, oreColor, 0.16]); });
  crystals.castShadow = true;
  crystals.userData = { kind: 'deposit', items: seams.map(([x, z, s, name]) => ({ x, z, name, grade: Math.round(38 + s * 22) })) };
  pickables.push(crystals); group.add(crystals);

  // Vehicles.
  const fleet = [];
  const drive = (type, count, route, speed, lane) => {
    const mesh = new THREE.InstancedMesh(MODELS[type](), kit, count);
    mesh.castShadow = true; group.add(mesh);
    for (let i = 0; i < count; i++) fleet.push({ kind: type, mesh, i, route, s: (route.total * i) / count + rnd() * 20, speed, lane, pos: new THREE.Vector3(), x: 0, z: 0, name: type === 'bus' ? `Loop bus ${i + 1}` : `Haul truck ${i + 1}` });
  };
  drive('bus', 4, busRoute, 11, 2.2); drive('truck', 3, roads[7].path, 7.5, 2);

  // People.
  const walkers = [];
  const walkable = roads.filter((rd) => !rd.closed), totalLen = walkable.reduce((s, rd) => s + rd.path.total * (rd.work ? 0.35 : 1), 0);
  const want = Math.round(THREE.MathUtils.clamp(def.population / 10, 40, 220));
  for (const rd of walkable) for (let i = 0, n = Math.round((want * rd.path.total * (rd.work ? 0.35 : 1)) / totalLen); i < n; i++) {
    const miner = rd.work || rnd() < 0.18;
    walkers.push({
      kind: 'citizen', path: rd.path, s: rnd() * rd.path.total, dir: rnd() < 0.5 ? 1 : -1, speed: 1.1 + rnd() * 0.6, off: (rnd() < 0.5 ? 1 : -1) * (rd.w / 2 + 1.2 + rnd() * 1.2), idle: rnd() < 0.08,
      pos: new THREE.Vector3(), x: 0, z: 0, tint: miner ? K.suits[0] : K.suits[2 + Math.floor(rnd() * 5)],
      name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`, job: (miner ? JOBS_PIT : JOBS_TOWN)[Math.floor(rnd() * (miner ? JOBS_PIT : JOBS_TOWN).length)],
      thought: THOUGHTS[Math.floor(rnd() * THOUGHTS.length)], street: rd.name, age: 19 + Math.floor(rnd() * 40),
    });
  }
  const cg = citizenGeometry();
  cg.setAttribute('iTint', new THREE.InstancedBufferAttribute(new Float32Array(walkers.flatMap((w) => _c.set(w.tint).toArray())), 3));
  cg.setAttribute('iWalk', new THREE.InstancedBufferAttribute(new Float32Array(walkers.map((w) => (w.idle ? 0 : 1))), 1));
  const people = new THREE.InstancedMesh(cg, kitMaterial(shared, (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tintMask, iWalk; attribute vec2 limb; attribute vec3 iTint;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= mix(vec3(1.), iTint, tintMask);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += limb.x * sin(uTime * 7.5 + float(gl_InstanceID) * 1.7) * iWalk * (limb.y - position.y) * .55;');
  }), walkers.length);
  people.castShadow = true; people.frustumCulled = false;
  group.add(people);

  // Light on the ground at night. The last pools belong to the vehicles.
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }), pools.length + fleet.length);
  pools.forEach(([x, z, r, colr, k], i) => { poolMesh.setMatrixAt(i, frame.matrix(x, z, hgt(x, z) + 0.12, 0, M4, r * 2, 1, r * 2)); poolMesh.setColorAt(i, _c.copy(colr).multiplyScalar(k)); });
  fleet.forEach((_, i) => poolMesh.setColorAt(pools.length + i, _c.set('#fff1cf').multiplyScalar(0.16)));
  poolMesh.frustumCulled = false; poolMesh.renderOrder = 2;
  group.add(poolMesh);

  // From orbit a window is smaller than a pixel. This map of the town's lights takes its place when the camera is far.
  const lm = document.createElement('canvas'), g2 = lm.getContext('2d'), SPAN = 1120;
  lm.width = lm.height = 256; g2.fillStyle = '#000'; g2.fillRect(0, 0, 256, 256); g2.globalCompositeOperation = 'lighter';
  const dot = (x, z, r, color, a) => {
    const px = ((x + SPAN / 2) / SPAN) * 256, py = ((z + SPAN / 2) / SPAN) * 256, rr = Math.max(1.3, (r / SPAN) * 256), gr = g2.createRadialGradient(px, py, 0, px, py, rr);
    gr.addColorStop(0, color); gr.addColorStop(1, '#000'); g2.fillStyle = gr; g2.globalAlpha = a; g2.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  };
  for (const type of Object.keys(items)) for (const it of items[type]) {
    if (it.label === 'hab') dot(it.x, it.z, 11, '#ffc56e', 0.5 + 0.5 * rnd());
    else if (type === 'lamp') dot(it.x, it.z, 7, '#ffab3d', 0.55);
    else if (type === 'dome') dot(it.x, it.z, 20, '#63e0b0', 0.7);
    else if (['plant', 'crusher', 'silo', 'hall', 'headframe', 'warehouse'].includes(type)) dot(it.x, it.z, 30, '#ffab3d', 0.8);
    else if (type === 'pad' || type === 'reactor') dot(it.x, it.z, 34, '#cfe6ff', 0.55);
  }
  for (const [x, z, s] of seams) dot(x, z, 13 * s, `#${oreColor.getHexString()}`, 0.8);
  const farGlow = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN).rotateX(-Math.PI / 2).translate(0, 40, 0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lm), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  farGlow.material.map.colorSpace = THREE.SRGBColorSpace; farGlow.renderOrder = 3;
  group.add(farGlow);

  // Red lights on the tall things.
  const beaconSpots = [[82, -27, 60.6], [-150, 152, 39.2], [-108 - 14 * Math.cos(0.25) - 6 * Math.sin(0.25), -128 + 14 * Math.sin(0.25) - 6 * Math.cos(0.25), 43.8], [130, 322, 23.2]];
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff3b2f', fog: false });
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), beaconMat, beaconSpots.length);
  beaconSpots.forEach(([x, z, y], i) => beacons.setMatrixAt(i, frame.matrix(x, z, hgt(x, z) + y, 0, M4)));
  group.add(beacons);

  for (const m of pickables) m.computeBoundingSphere();

  const S4 = {}, lumpUp = new THREE.Vector3();
  let near = true, farAmount = 0;

  return {
    group, quat, frame, height: hgt, pickables, walkers, fleet, name: def.name,
    // Town x,z of a direction in the planet frame (unit vector).
    townOf(dir, out) {
      const v = a3.copy(dir).multiplyScalar(R).applyMatrix4(_m.copy(group.matrix).invert());
      const a = Math.acos(THREE.MathUtils.clamp((v.y + R) / R, -1, 1)), h = Math.hypot(v.x, v.z) || 1;
      out.x = (v.x / h) * a * R; out.z = (v.z / h) * a * R; return out;
    },
    // Planet-frame direction of a town point.
    dirOf(x, z, out) { return frame.pos(x, z, 0, out).applyMatrix4(group.matrix).normalize(); },
    // dist: camera distance in metres. Small things are skipped when the camera is far.
    setDetail(dist) { near = dist < 900; people.visible = near; rockLumps.visible = oreLumps.visible = dist < 1600; farAmount = smooth(900, 4500, dist); },
    update(dt, night, lit) {
      shared.uTime.value += dt; shared.uNight.value = night; shared.uLit.value = lit;
      const t = shared.uTime.value;
      poolMesh.material.opacity = night;
      farGlow.material.opacity = night * farAmount * 1.6; farGlow.visible = farGlow.material.opacity > 0.01;
      beaconMat.color.setRGB(2.4, 0.3, 0.22).multiplyScalar(0.15 + 0.85 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.4), 6));

      fleet.forEach((v, k) => {
        v.route.at(v.s, S4);
        let slow = 1;
        if (v.kind === 'bus') { let d = 1e9; for (const s of stops) d = Math.min(d, Math.hypot(S4.x - s[0], S4.z - s[1])); slow = 0.1 + 0.9 * smooth(9, 26, d); }
        v.s += v.speed * slow * dt;
        v.x = S4.x - S4.dz * v.lane; v.z = S4.z + S4.dx * v.lane;
        const head = Math.atan2(S4.dx, S4.dz), y = hgt(v.x, v.z);
        v.mesh.setMatrixAt(v.i, frame.matrix(v.x, v.z, y, head, M4)); v.mesh.instanceMatrix.needsUpdate = true;
        v.pos.setFromMatrixPosition(M4);
        poolMesh.setMatrixAt(pools.length + k, frame.matrix(v.x + S4.dx * 11, v.z + S4.dz * 11, y + 0.14, head, M4, 8, 1, 17));
      });
      poolMesh.instanceMatrix.needsUpdate = true;

      if (rockLumps.visible) {
        let ri = 0, oi = 0;
        for (let i = 0; i < lumpCount; i++) {
          const d = (i * 3.2 + t * 2.6) % beltLen;
          let s = segs[0]; for (const q of segs) if (d >= q.start) s = q;
          a3.copy(s.a).lerp(s.b, (d - s.start) / s.len).addScaledVector(lumpUp.copy(s.up), 0.3);
          M4.makeRotationY(i * 1.3).setPosition(a3);
          if (i % 7 === 3) oreLumps.setMatrixAt(oi++, M4); else rockLumps.setMatrixAt(ri++, M4);
        }
        rockLumps.count = ri; oreLumps.count = oi;
        rockLumps.instanceMatrix.needsUpdate = oreLumps.instanceMatrix.needsUpdate = true;
      }

      if (near) {
        walkers.forEach((w, i) => {
          if (!w.idle) { w.s += w.dir * w.speed * dt; if (w.s > w.path.total || w.s < 0) { w.dir *= -1; w.s = Math.min(Math.max(w.s, 0), w.path.total); } }
          w.path.at(w.s, S4);
          w.x = S4.x - S4.dz * w.off; w.z = S4.z + S4.dx * w.off;
          people.setMatrixAt(i, frame.matrix(w.x, w.z, hgt(w.x, w.z), Math.atan2(S4.dx * w.dir, S4.dz * w.dir), M4));
          w.pos.setFromMatrixPosition(M4);
        });
        people.instanceMatrix.needsUpdate = true;
      }
    },
    // Text for the selection sheet.
    describe(hit) {
      const n = (k, lo, hi) => Math.round(lo + hash2(hit.index | 0, k, seed) * (hi - lo));
      if (hit.kind === 'citizen') { const w = hit.item; return { kind: 'citizen', title: w.name, subtitle: `${w.job}, ${def.name}`, rows: [['Age', w.age], ['Now', w.idle ? 'Waiting' : `Walking on ${w.street}`], ['Shift', hit.index % 2 ? 'Night' : 'Day']], note: w.thought }; }
      if (hit.kind === 'bus') return { kind: 'vehicle', title: hit.item.name, subtitle: 'Mine gate to the homes and back', rows: [['On board', n(1, 3, 28)], ['Next stop', ['Mine gate', 'Assay office', 'North loop', 'Domes', 'South loop'][n(2, 0, 4)]]] };
      if (hit.kind === 'truck') return { kind: 'vehicle', title: hit.item.name, subtitle: 'Rim road', rows: [['Load', `${n(1, 18, 40)} t`], ['Runs this shift', n(2, 4, 19)]] };
      if (hit.kind === 'deposit') return { kind: 'deposit', title: hit.item.name, subtitle: null, rows: [['Grade', `${hit.item.grade}%`], ['Reach', `${n(3, 40, 260)} m`], ['Claimed', hit.index < 5 ? 'Yes' : 'Not yet']] };
      if (hit.type === 'belt') return { kind: 'building', title: 'Belt line', subtitle: 'Pit to mill to silos to the pad', rows: [['Rate', `${n(1, 60, 95)} t/h`], ['Length', `${Math.round(beltLen)} m`]] };
      const [title, role] = CATALOG[hit.type] || [hit.type, ''];
      const rows = hit.type === 'hab' ? [['Floors', hit.item.floors], ['People', hit.item.floors * n(1, 5, 9)], ['Air', 'Good']]
        : ['plant', 'crusher', 'silo', 'headframe', 'excavator'].includes(hit.type) ? [['Crew', n(1, 4, 38)], ['Rate', `${n(2, 40, 96)} t/h`], ['State', 'Running']]
        : hit.type === 'dome' ? [['Crop', ['Tomatoes', 'Barley', 'Beans', 'Greens'][n(1, 0, 3)]], ['Yield', `${n(2, 60, 99)}%`]]
        : [['Crew', n(1, 1, 12)], ['State', 'In use']];
      return { kind: 'building', title, subtitle: role, rows };
    },
  };
}

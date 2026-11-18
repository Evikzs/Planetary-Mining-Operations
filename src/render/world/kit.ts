import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshLambertMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { Glow } from '../../ui/tokens';
import { NIGHT } from '../glsl';

// Fable's colony kit: low-poly parts with vertex paint, a glow colour per vertex and a window id.
// Parts are built in metres, as in Fable's shell; models scale them to world units (1 unit = 40 m).

export const METRES_PER_UNIT = 40;
export const TAU = Math.PI * 2;

/** Uniforms every lit thing in the scene shares, set by the renderer each frame. */
export interface SceneUniforms {
  /** Unit vector from the Moon's centre to the sun, in world space. */
  uSunDir: { value: Vector3 };
  /** Seconds of real time, for things that move on their own (limbs, glints). */
  uTime: { value: number };
  /** Share of windows lit, from the local hour under the camera. */
  uLit: { value: number };
  /** The world seed, as a float, for shader noise. */
  uSeed: { value: number };
}

export function createSceneUniforms(seed: number): SceneUniforms {
  return {
    uSunDir: { value: new Vector3(0, 0, 1) },
    uTime: { value: 0 },
    uLit: { value: 0.6 },
    uSeed: { value: (seed % 997) / 37 },
  };
}

export interface PartOptions {
  rx?: number;
  ry?: number;
  rz?: number;
  glow?: Glow;
  /** Above 0: a window that is dark or lit at random. */
  gid?: number;
}

const color = new Color();
const euler = new Euler();
const matrix = new Matrix4();

/** Flat paint, glow and window id on every vertex of a primitive, made non-indexed. */
export function paint(geo: BufferGeometry, hex: string, glow?: Glow, gid = 0): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const gl = new Float32Array(n * 3);
  color.set(hex);
  for (let i = 0; i < n; i++) color.toArray(col, i * 3);
  if (glow) {
    color.set(glow[0]).multiplyScalar(glow[1]);
    for (let i = 0; i < n; i++) color.toArray(gl, i * 3);
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('glow', new BufferAttribute(gl, 3));
  g.setAttribute('gid', new BufferAttribute(new Float32Array(n).fill(gid), 1));
  return g;
}

/** Turns a part about its own centre, then moves it to (x, y, z). */
export const put = (g: BufferGeometry, x: number, y: number, z: number, o: PartOptions = {}) =>
  g.applyMatrix4(
    matrix.makeRotationFromEuler(euler.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)).setPosition(x, y, z),
  );

/** A box whose base sits at height y. */
export const box = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  o: PartOptions = {},
) => put(paint(new BoxGeometry(w, h, d), hex, o.glow, o.gid), x, y + h / 2, z, o);

/** A cylinder (or cone) whose base sits at height y. */
export const cyl = (
  top: number,
  bottom: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  o: PartOptions = {},
) => put(paint(new CylinderGeometry(top, bottom, h, seg), hex, o.glow, o.gid), x, y + h / 2, z, o);

/** An upper half sphere sitting on height y. */
export const half = (
  r: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  o: PartOptions = {},
) =>
  put(paint(new SphereGeometry(r, seg, 5, 0, TAU, 0, Math.PI / 2), hex, o.glow, o.gid), x, y, z, o);

/** A whole sphere centred at height y. */
export const ball = (
  r: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  hex: string,
  o: PartOptions = {},
) => put(paint(new SphereGeometry(r, seg, Math.ceil(seg * 0.6)), hex, o.glow, o.gid), x, y, z, o);

/**
 * Lambert with flat faces, vertex paint and night glow. Glow is faint by day and full at night;
 * night comes from each instance's own place under the sun, so every settlement lights up at its
 * own dusk. A window (gid > 0) is lit or dark at random, more of them lit in the evening.
 */
export function kitMaterial(
  u: SceneUniforms,
  extra?: (sh: WebGLProgramParametersWithUniforms) => void,
): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uSunDir: u.uSunDir, uLit: u.uLit, uTime: u.uTime });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 glow; attribute float gid;
uniform vec3 uSunDir; uniform float uLit, uTime;
varying vec3 vGlow;
${NIGHT}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 origin_ = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
  float inst_ = float(gl_InstanceID);
#else
  vec3 origin_ = (modelMatrix * vec4(transformed, 1.)).xyz;
  float inst_ = 0.;
#endif
  float on_ = gid < .5 ? 1. : step(fract(sin((gid + inst_ * .37) * 91.7) * 43758.5), uLit);
  vGlow = glow * on_ * mix(.05, 1., nightAt(origin_, uSunDir));`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;',
      );
    extra?.(sh);
  };
  return m;
}

/** A soft round glow, white, for light pools on the ground and lights seen from afar. */
export function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [t, a] of [
    [0, 1],
    [0.05, 0.6],
    [0.12, 0.25],
    [0.3, 0.07],
    [0.6, 0.015],
    [1, 0],
  ] as const) {
    grad.addColorStop(t, `rgba(255,255,255,${a})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CubeCamera,
  Group,
  HalfFloatType,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import { createRng, deriveSeed } from '../sim/rng';
import { NOISE, TONE } from './glsl';

// Fable's sky: a dust band baked once into a cube, and stars, all at infinite distance.
// The Moon has no air, so both show at noon.

export const STAR_COUNT = 6500;

// The dust band is the great circle at a right angle to this axis.
const BAND_AXIS = new Vector3(0.537, 0.414, -0.734).normalize();

/** Draws at the far plane, with the camera's position ignored. */
const FAR_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.); gl_Position = p.xyww; }`;

function bakeDust(renderer: WebGLRenderer): WebGLCubeRenderTarget {
  const target = new WebGLCubeRenderTarget(512, { type: HalfFloatType, generateMipmaps: false });
  const scene = new Scene();
  const geometry = new SphereGeometry(5, 32, 16);
  const material = new ShaderMaterial({
    side: BackSide,
    uniforms: { uAxis: { value: BAND_AXIS } },
    vertexShader:
      'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform vec3 uAxis; ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float b = smoothstep(.5, 1., 1. - abs(dot(d, uAxis)));
        float n1 = fbm(d * 2.5 + 3.), n2 = fbm(d * 6. + n1 * 2.), n3 = fbm(d * 14. + 7.);
        vec3 col = vec3(.0030, .0034, .0052);
        col += vec3(.020, .013, .026) * b * (.4 + .6 * n1);
        // Rose into amber: the same pink as the ore, far away and faint.
        col += mix(vec3(.105, .022, .048), vec3(.115, .058, .016), n3) * b * smoothstep(.4, .82, n2) * .6;
        col *= 1. - .8 * b * smoothstep(.48, .72, fbm(d * 4. + 11.));
        col += vec3(.030, .027, .024) * pow(b, 6.) * (.4 + .6 * n3);
        gl_FragColor = vec4(col * 1.7, 1.);
      }`,
  });
  scene.add(new Mesh(geometry, material));
  new CubeCamera(0.1, 10, target).update(renderer, scene);
  geometry.dispose();
  material.dispose();
  return target;
}

/** Seeded star directions (unit vectors), more of them near the dust band. */
export function starPositions(seed: number): Float32Array {
  const rng = createRng(deriveSeed(seed, 'stars'));
  const out = new Float32Array(STAR_COUNT * 3);
  const v = new Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    do {
      v.set(rng.next() * 2 - 1, rng.next() * 2 - 1, rng.next() * 2 - 1);
    } while (
      v.lengthSq() > 1 ||
      v.lengthSq() < 0.01 ||
      rng.next() > 0.3 + 0.7 * Math.pow(1 - Math.abs(v.clone().normalize().dot(BAND_AXIS)), 3)
    );
    v.normalize().toArray(out, i * 3);
  }
  return out;
}

function starGeometry(seed: number): BufferGeometry {
  const rng = createRng(deriveSeed(seed, 'starLight'));
  const col = new Float32Array(STAR_COUNT * 3);
  const size = new Float32Array(STAR_COUNT);
  const phase = new Float32Array(STAR_COUNT);
  const tints = [
    [0.72, 0.82, 1],
    [1, 1, 1],
    [1, 0.95, 0.82],
    [1, 0.82, 0.6],
    [1, 0.66, 0.5],
  ] as const;
  for (let i = 0; i < STAR_COUNT; i++) {
    const big = Math.pow(rng.next(), 9);
    size[i] = 1.3 + 4.2 * big;
    const t = tints[Math.floor(rng.next() * rng.next() * tints.length)]!;
    const gain = 0.35 + 0.5 * rng.next() + 2.2 * big;
    col.set([t[0] * gain, t[1] * gain, t[2] * gain], i * 3);
    phase[i] = rng.next();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(starPositions(seed), 3));
  g.setAttribute('aCol', new BufferAttribute(col, 3));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.setAttribute('aPh', new BufferAttribute(phase, 1));
  return g;
}

export interface Sky {
  readonly group: Group;
  /** Seconds of real time (the twinkle), and the pixel ratio for star sizes. */
  update(time: number, pixelRatio: number): void;
  dispose(): void;
}

export function createSky(renderer: WebGLRenderer, seed: number, reducedMotion: boolean): Sky {
  const dustTarget = bakeDust(renderer);
  const box = new BoxGeometry(2, 2, 2);
  const dustMaterial = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { uCube: { value: dustTarget.texture } },
    vertexShader: FAR_VERT,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform samplerCube uCube;
      void main(){ gl_FragColor = vec4(textureCube(uCube, normalize(vDir)).rgb, 1.); ${TONE} }`,
  });
  const dust = new Mesh(box, dustMaterial);

  const starUniforms = { uPx: { value: 1 }, uTime: { value: 0 } };
  const starGeo = starGeometry(seed);
  const starMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: starUniforms,
    vertexShader: /* glsl */ `
      attribute float aSize, aPh; attribute vec3 aCol; uniform float uPx, uTime; varying vec3 vCol;
      void main(){
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.); gl_Position = p.xyww;
        float tw = 1. - .06 * (.5 + .5 * sin(uTime * (1.3 + aPh * 2.) + aPh * 40.));
        gl_PointSize = aSize * uPx;
        vCol = aCol * tw;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main(){ float a = smoothstep(.5, 0., length(gl_PointCoord - .5)); gl_FragColor = vec4(vCol * a * a, 1.); ${TONE} }`,
  });
  const stars = new Points(starGeo, starMaterial);

  const group = new Group();
  [dust, stars].forEach((o, i) => {
    o.frustumCulled = false;
    o.renderOrder = -30 + i * 10;
    group.add(o);
  });
  return {
    group,
    update(time, pixelRatio) {
      starUniforms.uTime.value = reducedMotion ? 0 : time;
      starUniforms.uPx.value = pixelRatio;
    },
    dispose() {
      group.removeFromParent();
      box.dispose();
      dustMaterial.dispose();
      dustTarget.dispose();
      starGeo.dispose();
      starMaterial.dispose();
    },
  };
}

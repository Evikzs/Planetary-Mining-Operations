// Everything at infinite distance: dust band, stars, and the daytime sky you see from inside an atmosphere.
import * as THREE from 'three';
import { NOISE, VEIL } from './glsl.js';

// Draws at the far plane, with camera position ignored.
const FAR_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.); gl_Position = p.xyww; }`;

const TONE = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

// The dust band is the great circle at a right angle to this axis. It crosses the first view of the system on a slant.
const BAND_AXIS = new THREE.Vector3(0.537, 0.414, -0.734).normalize();

function bakeDust(renderer) {
  const target = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType, generateMipmaps: false });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uAxis: { value: BAND_AXIS } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
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
  })));
  new THREE.CubeCamera(0.1, 10, target).update(renderer, scene);
  return target.texture;
}

function starGeometry(count) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count);
  const tints = [[0.72, 0.82, 1], [1, 1, 1], [1, 0.95, 0.82], [1, 0.82, 0.6], [1, 0.66, 0.5]];
  const v = new THREE.Vector3();
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    // More stars near the dust band.
    do { v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01 || rnd() > 0.3 + 0.7 * Math.pow(1 - Math.abs(v.normalize().dot(BAND_AXIS)), 3));
    v.normalize().toArray(pos, i * 3);
    const big = Math.pow(rnd(), 9);
    size[i] = 1.3 + 4.2 * big;
    const t = tints[Math.floor(rnd() * rnd() * tints.length)], gain = 0.35 + 0.5 * rnd() + 2.2 * big;
    col.set([t[0] * gain, t[1] * gain, t[2] * gain], i * 3);
    ph[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  return g;
}

export function createSky(renderer) {
  // Air around the camera. Shared by the three layers.
  const air = {
    uUp: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Vector3(1, 0, 0) },
    uDensity: { value: 0 }, uHorMu: { value: 0 },
  };
  const AIR_GLSL = /* glsl */ `
    uniform vec3 uUp, uSun; uniform float uDensity, uHorMu; ${VEIL}
    float elev(vec3 v){ return clamp((dot(v, uUp) - uHorMu) / (1. - uHorMu), 0., 1.); }
    float veil(vec3 v){ return clamp(skyVeil(elev(v), dot(uSun, uUp), uDensity) * 1.35, 0., 1.); }`;

  const dust = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { ...air, uCube: { value: bakeDust(renderer) } },
    vertexShader: FAR_VERT,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform samplerCube uCube; ${AIR_GLSL}
      void main(){ vec3 v = normalize(vDir); gl_FragColor = vec4(textureCube(uCube, v).rgb * (1. - veil(v)), 1.); ${TONE} }`,
  }));

  const starUniforms = { ...air, uPx: { value: 1 }, uTime: { value: 0 } };
  const stars = new THREE.Points(starGeometry(6500), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: starUniforms,
    vertexShader: /* glsl */ `
      attribute float aSize, aPh; attribute vec3 aCol; uniform float uPx, uTime; varying vec3 vCol; ${AIR_GLSL}
      void main(){
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.); gl_Position = p.xyww;
        float tw = 1. - (.06 + .3 * uDensity) * (.5 + .5 * sin(uTime * (1.3 + aPh * 2.) + aPh * 40.));
        gl_PointSize = aSize * uPx;
        vCol = aCol * tw * (1. - veil(position));
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main(){ float a = smoothstep(.5, 0., length(gl_PointCoord - .5)); gl_FragColor = vec4(vCol * a * a, 1.); ${TONE} }`,
  }));

  const domeUniforms = {
    ...air, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunset: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: domeUniforms,
    vertexShader: FAR_VERT,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform vec3 uZenith, uHorizon, uSunset, uSunCol; ${AIR_GLSL}
      void main(){
        vec3 v = normalize(vDir);
        float mu = dot(v, uUp), e = dot(uSun, uUp), cs = max(dot(v, uSun), 0.), m = elev(v);
        float hz = pow(1. - m, 4.);
        float day = smoothstep(-.14, .12, e);
        float twi = smoothstep(-.3, -.02, e) * (1. - smoothstep(.02, .4, e));
        vec3 col = mix(uZenith, uHorizon, hz) * (.05 + .95 * day);
        // Dusk and dawn: colour sits on the horizon, on the side of the sun.
        float az = .5 + .5 * dot(normalize(v - uUp * mu + 1e-5), normalize(uSun - uUp * e + 1e-5));
        col += uSunset * twi * (hz * (.25 + .95 * az * az * az) + .14 * pow(1. - m, 1.5) * az);
        col += uSunCol * (pow(cs, 180.) * 1.2 + pow(cs, 12.) * .14) * day;
        gl_FragColor = vec4(col, skyVeil(m, e, uDensity));
        ${TONE}
      }`,
  }));

  const group = new THREE.Group();
  [dust, stars, dome].forEach((o, i) => { o.frustumCulled = false; o.renderOrder = -30 + i * 10; group.add(o); });

  return {
    group,
    // air: null in space. Else { up, sun, density, horMu, zenith, horizon, sunset, sunCol } with world-space unit vectors.
    update(time, pixelRatio, a) {
      starUniforms.uTime.value = time;
      starUniforms.uPx.value = pixelRatio;
      air.uDensity.value = a ? a.density : 0;
      dome.visible = !!a && a.density > 0.002;
      if (!a) return;
      air.uUp.value.copy(a.up); air.uSun.value.copy(a.sun); air.uHorMu.value = a.horMu;
      domeUniforms.uZenith.value.copy(a.zenith); domeUniforms.uHorizon.value.copy(a.horizon);
      domeUniforms.uSunset.value.copy(a.sunset); domeUniforms.uSunCol.value.copy(a.sunCol);
    },
  };
}

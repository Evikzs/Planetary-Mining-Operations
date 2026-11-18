import {
  AdditiveBlending,
  Color,
  MeshBasicMaterial,
  MeshLambertMaterial,
  ShaderMaterial,
  type Texture,
} from 'three';
import { LUNA_ORE, MINERALS } from '../data/minerals';
import type { SurfaceClass } from '../shared/terrain';
import { NIGHT, NOISE, TONE } from './glsl';
import { METRES_PER_UNIT, type SceneUniforms } from './world/kit';

/** Lunar ground by surface class: pale highlands, dark maria, cold frost at the poles. */
export const TERRAIN_COLORS: Record<SurfaceClass, string> = {
  0: '#8c877f', // highland
  1: '#4a4a50', // maria
  2: '#66625d', // crater floor
  3: '#a29b90', // rim
  4: '#8e9aa4', // polar frost
};

/**
 * Fable's ground on the streamed chunks: the class colour, broken by noise at three scales that
 * fade with distance; thin seams of Luna's ore colour; and grains that glitter near the sun's
 * reflection. Positions are taken in metres so Fable's frequencies carry over.
 */
export function terrainMaterial(u: SceneUniforms, low = false): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  // Low quality is plain class colour: per-pixel noise costs whole seconds in software rendering.
  if (low) return m;
  const ore = new Color(MINERALS[LUNA_ORE].color);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uSunDir: u.uSunDir,
      uSeed: u.uSeed,
      uOre: { value: ore },
      uMetres: { value: METRES_PER_UNIT },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.)).xyz;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorld; uniform vec3 uSunDir, uOre; uniform float uSeed, uMetres;
${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 pm_ = vWorld * uMetres;
float px_ = max(length(dFdx(pm_)), length(dFdy(pm_)));
vec3 n_ = normalize(vWorld);
float mid_ = fbm(n_ * 11. + uSeed * 1.7);
float g_ = .82 + .36 * mid_;
// Each layer fades out before its cells shrink to a few pixels, so no pixel-sized speckle shows.
g_ *= mix(1., .8 + .4 * vnoise(pm_ * .02), 1. - smoothstep(4., 10., px_));
g_ *= mix(1., .86 + .28 * vnoise(pm_ * .23), 1. - smoothstep(.35, .9, px_));
g_ *= mix(1., .9 + .2 * vnoise(pm_ * 1.9), 1. - smoothstep(.04, .1, px_));
diffuseColor.rgb *= g_;
// Seams: thin lines from orbit. Close to the ground they give way to glints only, so the
// plain under the buildings stays readable.
float r_ = 1. - abs(2. * fbm(n_ * 6. + uSeed * 3.1) - 1.);
// Widened by the pixel footprint so the line stays smooth, and faded as it grows thinner than that.
float rw_ = fwidth(r_);
float vein_ = smoothstep(.972 - rw_, .996 + rw_, r_) * smoothstep(.42, .62, fbm(n_ * 3. + uSeed * 5.3))
  * .024 / (.024 + rw_);
float far_ = smoothstep(1.5, 12., px_);
diffuseColor.rgb = mix(diffuseColor.rgb, uOre * (.45 + .6 * mid_), vein_ * .55 * far_);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
vec3 nw_ = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
if (dot(nw_, n_) < 0.) nw_ = -nw_;
// Glints are soft spots some 6 px across, never single pixels.
float cell_ = exp2(ceil(log2(max(px_ * 16., 2.))));
vec3 gp_ = pm_ / cell_;
float glit_ = step(.985, hash13(floor(gp_))) * smoothstep(.3, 0., length(fract(gp_) - .5))
  * pow(max(dot(nw_, normalize(normalize(cameraPosition - vWorld) + uSunDir)), 0.), 18.)
  * smoothstep(0., .15, dot(n_, uSunDir));
totalEmissiveRadiance += mix(vec3(1.), uOre, .6) * glit_ * (.6 + 5. * vein_) + uOre * vein_ * far_ * .015;`,
      );
  };
  return m;
}

/**
 * Additive light that shows only at night where it stands: pools under lamps and round buildings.
 * Each instance takes its colour from instanceColor.
 */
export function poolMaterial(u: SceneUniforms, map: Texture): MeshBasicMaterial {
  const m = new MeshBasicMaterial({
    map,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -24,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDir = u.uSunDir;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec3 uSunDir; varying float vNight;\n${NIGHT}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vNight = nightAt((modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz, uSunDir);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNight;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= vNight;',
      );
  };
  return m;
}

/**
 * Lights seen from far away: a dot per building that faces the camera and keeps a size on screen,
 * shown at night once the camera is high. `uFar` fades them in with altitude.
 */
export function farLightMaterial(u: SceneUniforms, map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uSunDir: u.uSunDir, uMap: { value: map }, uFar: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize;
      uniform vec3 uSunDir; uniform float uFar;
      varying vec2 vUv; varying vec3 vCol;
      ${NIGHT}
      void main(){
        vec3 origin = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
        float d = length(cameraPosition - origin);
        float s = aSize * max(1., d * .035);
        vec4 mv = viewMatrix * vec4(origin, 1.);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
        vUv = uv;
        vCol = aColor * nightAt(origin, uSunDir) * uFar;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vCol;
      void main(){ gl_FragColor = vec4(vCol * texture2D(uMap, vUv).a, 1.); ${TONE} }`,
  });
}

// The star, the worlds, their air and their orbits.
// All positions here are in system coordinates (star at 0). The shell moves the root so the focus is the origin.
import * as THREE from 'three';
import { NOISE, SURFACE } from './glsl.js';
import { INK, MINERALS } from './theme.js';

const TAU = Math.PI * 2;
const TONE = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const col = (hex) => new THREE.Color(hex);
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export const SUN_STRENGTH = 1.25;

// Unit vector for a latitude and longitude on a world.
export function surfaceDir(lat, lon, out = new THREE.Vector3()) {
  return out.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
}

// Far bodies are drawn larger so the system view reads. Apparent size still grows all the way in.
function displayScale(dist, radius, alpha) {
  return Math.pow(Math.max(dist / (radius * 20), 1), alpha);
}

const GLOBE_VERT = /* glsl */ `
varying vec3 vLocal; varying vec3 vView;
void main(){ vLocal = position; vec4 mv = modelViewMatrix * vec4(position, 1.); vView = mv.xyz; gl_Position = projectionMatrix * mv; }`;

const GLOBE_FRAG = /* glsl */ `
varying vec3 vLocal; varying vec3 vView;
uniform vec3 uSunL, uCamL, uSun, uSunsetTint, uAmbDay, uAmbNight, uRim, uLamp, uFogColor, uPatchDir;
uniform vec4 uSites[4];
uniform float uR, uSiteGlow, uPatchCos, uFogD, uHaze;
${NOISE}
${SURFACE}
vec3 bumpNormal(vec3 N, vec3 p, float h, float scale){
  vec3 dpdx = dFdx(p), dpdy = dFdy(p);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  return normalize(abs(det) * N - scale * sign(det) * (dFdx(h) * r1 + dFdy(h) * r2));
}
void main(){
  vec3 nL = normalize(vLocal);
  if (dot(nL, uPatchDir) > uPatchCos) discard; // the colony terrain covers this part
  float px = max(length(dFdx(vLocal)), length(dFdy(vLocal)));
  float vein, hgt;
  vec3 alb = surfaceAlbedo(vLocal, px, vein, hgt);
  vec3 N = uGas > .5 ? nL : bumpNormal(nL, vLocal, hgt, uR * .05 * smoothstep(1.5, 25., px));
  float geo = dot(nL, uSunL);
  vec3 sun = uSun * mix(uSunsetTint, vec3(1.), smoothstep(0., .25, geo)) * smoothstep(-.02, .1, geo);
  vec3 col = alb * (sun * max(dot(N, uSunL), 0.) + mix(uAmbNight, uAmbDay, smoothstep(-.15, .2, geo)));

  // Mineral glitter near the reflection of the sun.
  vec3 V = normalize(uCamL - vLocal);
  float cell = exp2(ceil(log2(max(px * 5., 2.))));
  vec3 gp = vLocal / cell;
  float gl = step(.965, hash13(floor(gp))) * smoothstep(.3, .05, length(fract(gp) - .5)) * pow(max(dot(N, normalize(V + uSunL)), 0.), 18.) * smoothstep(0., .15, geo);
  col += mix(vec3(1.), uOre, .6) * gl * (1.2 + 6. * vein) * (1. - uGas);

  // Lamp light of the settlements on the night side.
  float lit = 0.;
  for (int i = 0; i < 4; i++) {
    float f = 1. - smoothstep(0., max(uSites[i].w, 1e-4), acos(clamp(dot(nL, uSites[i].xyz), -1., 1.)));
    lit += f * f * (i == 0 ? uSiteGlow : 1.) * step(1e-4, uSites[i].w);
  }
  float lc = exp2(ceil(log2(max(px * 1.5, 12.))));
  float lh = hash13(floor(vLocal / lc) + 7.);
  col += uLamp * lit * (1. - smoothstep(-.14, .06, geo)) * (.25 + 2.4 * step(.45, lh) * lh);

  // Air: a rim of haze from space, distance fog from the ground.
  col += uRim * pow(1. - max(dot(nL, V), 0.), 3.) * smoothstep(-.2, .3, geo) * uHaze;
  col = mix(col, uFogColor, 1. - exp(-uFogD * uFogD * vView.z * vView.z));
  gl_FragColor = vec4(col, 1.);
  ${TONE}
}`;

const AIR_FRAG = /* glsl */ `
varying vec3 vLocal;
uniform vec3 uCamL, uSunL, uRim, uSunsetTint; uniform float uR, uRa, uStrength;
void main(){
  vec3 D = normalize(vLocal - uCamL);
  vec3 pc = uCamL + D * max(-dot(uCamL, D), 0.); // point of the view ray nearest to the centre
  float h = clamp((length(pc) - uR) / (uRa - uR), 0., 1.);
  float dens = exp(-h * 4.) * (1. - smoothstep(.7, 1., h));
  float s = dot(normalize(pc), uSunL);
  vec3 c = mix(uSunsetTint, uRim, smoothstep(-.1, .45, s));
  gl_FragColor = vec4(c * dens * smoothstep(-.3, .3, s) * uStrength * .8, 1.);
  ${TONE}
}`;

export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  [[0, 1], [0.05, 0.6], [0.12, 0.25], [0.3, 0.07], [0.6, 0.015], [1, 0]].forEach(([t, a]) => grad.addColorStop(t, `rgba(255,255,255,${a})`));
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeStar(def) {
  const group = new THREE.Group();
  const uniforms = { uColor: { value: col(def.color) }, uTime: { value: 0 } };
  group.add(new THREE.Mesh(new THREE.SphereGeometry(def.radius, 48, 32), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = normalize(position); vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uTime; ${NOISE}
      void main(){
        float n = fbm(vP * 4. + uTime * .03), g = fbm(vP * 16. - uTime * .07);
        float limb = pow(max(dot(normalize(vN), normalize(vV)), 0.), .5);
        gl_FragColor = vec4(uColor * (2.2 + 2.2 * n + 1.2 * g) * mix(.45, 1., limb), 1.);
        ${TONE}
      }`,
  })));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(def.color).multiplyScalar(1.5), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(def.radius * 8);
  group.add(glow);
  return { group, uniforms, radius: def.radius, scale: 1 };
}

function makeRings(def) {
  const g = new THREE.RingGeometry(def.radius * 1.35, def.radius * 2.35, 160, 1);
  g.rotateX(-Math.PI / 2);
  return new THREE.Mesh(g, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { uR: { value: def.radius }, uColor: { value: col(def.palette.high) }, uSunL: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: /* glsl */ `
      varying vec3 vP; uniform float uR; uniform vec3 uColor, uSunL; ${NOISE}
      void main(){
        float r = length(vP) / uR, t = (r - 1.35);
        float a = (.25 + .75 * vnoise(vec3(r * 38., 0., 3.))) * smoothstep(0., .05, t) * (1. - smoothstep(.9, 1., t)) * (.35 + .65 * step(.12, abs(t - .52)));
        // The world puts a shadow on its rings.
        vec3 p = vP / uR; float along = dot(p, uSunL);
        float shadow = along < 0. && length(p - uSunL * along) < 1. ? .12 : 1.;
        gl_FragColor = vec4(uColor * (.6 + .5 * vnoise(vec3(r * 9., 1., 0.))) * shadow, a * .8);
        ${TONE}
      }`,
  }));
}

function makePlanet(def) {
  const body = new THREE.Group();
  const ore = def.ore ? MINERALS[def.ore].color : '#ffffff';
  const air = def.atmosphere;
  const sites = [0, 1, 2, 3].map(() => new THREE.Vector4());
  if (def.colony) {
    const v = surfaceDir(def.colony.lat, def.colony.lon);
    sites[0].set(v.x, v.y, v.z, 420 / def.radius);
    (def.colony.outposts || []).slice(0, 3).forEach((o, i) => { surfaceDir(o.lat, o.lon, v); sites[i + 1].set(v.x, v.y, v.z, 130 / def.radius); });
  }
  const zen = air ? col(air.zenith) : col('#000000');
  const uniforms = {
    uLow: { value: col(def.palette.low) }, uHigh: { value: col(def.palette.high) }, uAccent: { value: col(def.palette.accent) },
    uOre: { value: col(ore) }, uSeed: { value: def.seed }, uGas: { value: def.kind === 'gas' ? 1 : 0 }, uR: { value: def.radius },
    uSunL: { value: new THREE.Vector3(1, 0, 0) }, uCamL: { value: new THREE.Vector3(0, 0, 1e6) },
    uSun: { value: new THREE.Color(1, 1, 1).multiplyScalar(SUN_STRENGTH) },
    uSunsetTint: { value: air ? col(air.sunset).lerp(col('#ffffff'), 0.45) : col('#ffffff') },
    // Light from the sky by day, a little cold light by night so the ground is not lost.
    uAmbDay: { value: air ? zen.clone().multiplyScalar(0.5 * air.density).addScalar(0.12) : col('#000000').addScalar(0.05) },
    uAmbNight: { value: new THREE.Color(0.034, 0.04, 0.062) },
    uRim: { value: air ? col(air.rim) : col('#000000') }, uLamp: { value: col(INK.lamp).multiplyScalar(2.2) },
    uSites: { value: sites }, uSiteGlow: { value: 1 },
    uPatchDir: { value: new THREE.Vector3(0, 1, 0) }, uPatchCos: { value: 2 },
    uFogColor: { value: new THREE.Color(0, 0, 0) }, uFogD: { value: 0 }, uHaze: { value: air ? 0.5 * air.density : 0 },
  };
  const globe = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 192, 96), new THREE.ShaderMaterial({ uniforms, vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG }));
  body.add(globe);

  let airUniforms = null;
  if (air) {
    const ra = def.radius + air.height * (def.kind === 'gas' ? 1 : 1.6);
    airUniforms = {
      uCamL: uniforms.uCamL, uSunL: uniforms.uSunL, uRim: uniforms.uRim, uSunsetTint: { value: col(air.sunset) },
      uR: { value: def.radius }, uRa: { value: ra }, uStrength: { value: air.density },
    };
    const shell = new THREE.Mesh(new THREE.SphereGeometry(ra, 96, 48), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: airUniforms,
      vertexShader: 'varying vec3 vLocal; void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: AIR_FRAG,
    }));
    body.add(shell);
  }
  let rings = null;
  if (def.rings) { rings = makeRings(def); body.add(rings); }

  const landable = def.kind !== 'gas';
  return {
    def, id: def.id, radius: def.radius, body, globe, uniforms, airUniforms, rings, landable,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), qTilt: new THREE.Quaternion().setFromAxisAngle(Z, def.tilt || 0),
    spin0: 0, spin: 0, scale: 1,
    site: def.colony ? surfaceDir(def.colony.lat, def.colony.lon) : null,
    dMin: landable ? 5 : def.radius * 0.9, dMax: def.radius * 6, dOrbit: def.radius * 2.6,
    colony: null, // filled by the shell when the colony is built
  };
}

export function createBodies(sys) {
  const root = new THREE.Group();
  const star = makeStar(sys.star);
  root.add(star.group);
  const planets = sys.planets.map(makePlanet);
  const orbits = new THREE.Group();
  const orbitMat = new THREE.LineBasicMaterial({ color: col(INK.brass), transparent: true, opacity: 0.3, depthWrite: false, fog: false });
  for (const p of planets) {
    root.add(p.body);
    const pts = [];
    for (let i = 0; i < 360; i++) pts.push(new THREE.Vector3(Math.cos(i / 360 * TAU) * p.def.orbit, 0, Math.sin(i / 360 * TAU) * p.def.orbit));
    orbits.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat));
  }
  root.add(orbits);

  const qSpin = new THREE.Quaternion(), qInv = new THREE.Quaternion(), v = new THREE.Vector3();

  return {
    root, star, planets,
    byId: (id) => planets.find((p) => p.id === id),
    // Step 1 of a frame: where everything is at sim time t.
    update(t) {
      star.uniforms.uTime.value = t;
      for (const p of planets) {
        const a = p.def.phase + (t * TAU) / p.def.period;
        p.pos.set(Math.cos(a) * p.def.orbit, 0, -Math.sin(a) * p.def.orbit);
        p.spin = p.spin0 + (t * TAU) / p.def.day;
        p.quat.copy(p.qTilt).multiply(qSpin.setFromAxisAngle(Y, p.spin));
      }
    },
    // Step 2: after the camera is known (system coordinates), set scales and view uniforms.
    place(cam, focus) {
      star.scale = displayScale(cam.length(), star.radius * 1.5, 0.9);
      star.group.scale.setScalar(star.scale);
      for (const p of planets) {
        const dist = v.copy(cam).sub(p.pos).length();
        p.scale = displayScale(dist, p.radius, 0.72);
        p.body.position.copy(p.pos); p.body.quaternion.copy(p.quat); p.body.scale.setScalar(p.scale);
        qInv.copy(p.quat).invert();
        p.uniforms.uCamL.value.copy(cam).sub(p.pos).applyQuaternion(qInv).divideScalar(p.scale);
        p.uniforms.uSunL.value.copy(p.pos).negate().normalize().applyQuaternion(qInv);
        if (p.rings) p.rings.material.uniforms.uSunL.value.copy(p.uniforms.uSunL.value);
      }
      // An orbit line goes through its world, so hide the lines when the camera is near one.
      orbitMat.opacity = focus ? 0.3 * THREE.MathUtils.smoothstep(v.copy(cam).sub(focus.pos).length(), focus.radius * 8, focus.radius * 30) : 0.3;
      orbits.visible = orbitMat.opacity > 0.003;
    },
    // Sun direction in the frame that turns with the world.
    sunLocal: (p, out) => out.copy(p.uniforms.uSunL.value),
  };
}

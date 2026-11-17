import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  Vector4,
  type Texture,
} from 'three';
import { MINERALS } from '../../data/minerals';
import { ink } from '../../ui/tokens';
import { NOISE, TONE } from '../glsl';
import { SOL, SUN, type BodyDef } from './sol';

// Fable's star, worlds, air, rings and orbits, for Sol. Positions are in system units with the
// Sun at 0; the view moves the root so the body in focus sits near the origin.

const TAU = Math.PI * 2;
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const col = (hex: string): Color => new Color(hex);

export const SUN_STRENGTH = 1.25;

const SURFACE = /* glsl */ `
uniform vec3 uLow, uHigh, uAccent, uOre;
uniform float uSeed, uGas, uVeins;
vec3 surfaceAlbedo(vec3 p, float px, out float vein, out float hgt) {
  vec3 n = normalize(p);
  vein = 0.; hgt = 0.;
  if (uGas > .5) {
    float w = fbm(n * 3. + uSeed) - .5;
    float b = fbm(vec3(uSeed, n.y * 7. + w * 1.1, uSeed * 2.));
    float f = fbm(vec3(n.x * 5., n.y * 34. + w * 3., n.z * 5.) + uSeed);
    vec3 g = mix(uLow, uHigh, smoothstep(.3, .7, b));
    return mix(g, uAccent, smoothstep(.55, .8, f) * .5);
  }
  float cont = fbm(n * 2.1 + uSeed);
  float mid = fbm(n * 11. + uSeed * 1.7);
  vec3 c = mix(uLow, uHigh, smoothstep(.38, .62, cont + (mid - .5) * .45));
  c = mix(c, uAccent, smoothstep(.52, .75, fbm(n * 5. - uSeed)) * .6);
  float r = 1. - abs(2. * fbm(n * 6. + uSeed * 3.1) - 1.);
  vein = smoothstep(.972, .996, r) * smoothstep(.42, .62, fbm(n * 3. + uSeed * 5.3)) * uVeins;
  c = mix(c, uOre * (.45 + .6 * mid), vein * .55);
  hgt = cont + mid * .3;
  return c;
}`;

const GLOBE_VERT = /* glsl */ `
varying vec3 vLocal;
void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const GLOBE_FRAG = /* glsl */ `
varying vec3 vLocal;
uniform vec3 uSunL, uCamL, uSun, uSunsetTint, uAmbDay, uAmbNight, uRim, uLamp;
uniform vec4 uSites[4];
uniform float uR, uHaze;
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
  float gl = step(.975, hash13(floor(gp))) * smoothstep(.3, .05, length(fract(gp) - .5))
    * pow(max(dot(N, normalize(V + uSunL)), 0.), 18.) * smoothstep(0., .15, geo);
  col += mix(vec3(1.), uOre, .6) * gl * (.8 + 6. * vein) * (1. - uGas) * uVeins;
  // Lamp light of the settlements on the night side.
  float lit = 0.;
  for (int i = 0; i < 4; i++) {
    float f = 1. - smoothstep(0., max(uSites[i].w, 1e-4), acos(clamp(dot(nL, uSites[i].xyz), -1., 1.)));
    lit += f * f * step(1e-4, uSites[i].w);
  }
  float lc = exp2(ceil(log2(max(px * 1.5, 12.))));
  float lh = hash13(floor(vLocal / lc) + 7.);
  col += uLamp * lit * (1. - smoothstep(-.14, .06, geo)) * (.25 + 2.4 * step(.45, lh) * lh);
  // Air: a rim of haze from space.
  col += uRim * pow(1. - max(dot(nL, V), 0.), 3.) * smoothstep(-.2, .3, geo) * uHaze;
  gl_FragColor = vec4(col, 1.);
  ${TONE}
}`;

const AIR_FRAG = /* glsl */ `
varying vec3 vLocal;
uniform vec3 uCamL, uSunL, uRim, uSunsetTint; uniform float uR, uRa, uStrength;
void main(){
  vec3 D = normalize(vLocal - uCamL);
  vec3 pc = uCamL + D * max(-dot(uCamL, D), 0.);
  float h = clamp((length(pc) - uR) / (uRa - uR), 0., 1.);
  float dens = exp(-h * 4.) * (1. - smoothstep(.7, 1., h));
  float s = dot(normalize(pc), uSunL);
  vec3 c = mix(uSunsetTint, uRim, smoothstep(-.1, .45, s));
  gl_FragColor = vec4(c * dens * smoothstep(-.3, .3, s) * uStrength * .8, 1.);
  ${TONE}
}`;

/** Far bodies are drawn larger so the system reads; their size still grows all the way in. */
const displayScale = (dist: number, radius: number, alpha: number): number =>
  Math.pow(Math.max(dist / (radius * 20), 1), alpha);

export interface Star {
  group: Group;
  uniforms: { uColor: { value: Color }; uTime: { value: number } };
  radius: number;
  scale: number;
}

function makeStar(glow: Texture): Star {
  const group = new Group();
  const uniforms = { uColor: { value: col(SUN.color) }, uTime: { value: 0 } };
  group.add(
    new Mesh(
      new SphereGeometry(SUN.radius, 48, 32),
      new ShaderMaterial({
        uniforms,
        vertexShader:
          'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = normalize(position); vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
        fragmentShader: /* glsl */ `
          varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uTime; ${NOISE}
          void main(){
            float n = fbm(vP * 4. + uTime * .03), g = fbm(vP * 16. - uTime * .07);
            float limb = pow(max(dot(normalize(vN), normalize(vV)), 0.), .5);
            gl_FragColor = vec4(uColor * (2.2 + 2.2 * n + 1.2 * g) * mix(.45, 1., limb), 1.);
            ${TONE}
          }`,
      }),
    ),
  );
  const halo = new Sprite(
    new SpriteMaterial({
      map: glow,
      color: col(SUN.color).multiplyScalar(1.5),
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(SUN.radius * 8);
  group.add(halo);
  return { group, uniforms, radius: SUN.radius, scale: 1 };
}

/** The rings share their world's sun direction, so their shadow follows it. */
function makeRings(def: BodyDef, sunL: { value: Vector3 }): Mesh<BufferGeometry, ShaderMaterial> {
  const g = new RingGeometry(def.radius * 1.35, def.radius * 2.35, 160, 1);
  g.rotateX(-Math.PI / 2);
  return new Mesh(
    g,
    new ShaderMaterial({
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uR: { value: def.radius },
        uColor: { value: col(def.palette.high) },
        uSunL: sunL,
      },
      vertexShader:
        'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: /* glsl */ `
        varying vec3 vP; uniform float uR; uniform vec3 uColor, uSunL; ${NOISE}
        void main(){
          float r = length(vP) / uR, t = (r - 1.35);
          float a = (.25 + .75 * vnoise(vec3(r * 38., 0., 3.))) * smoothstep(0., .05, t) * (1. - smoothstep(.9, 1., t)) * (.35 + .65 * step(.12, abs(t - .52)));
          vec3 p = vP / uR; float along = dot(p, uSunL);
          float shadow = along < 0. && length(p - uSunL * along) < 1. ? .12 : 1.;
          gl_FragColor = vec4(uColor * (.6 + .5 * vnoise(vec3(r * 9., 1., 0.))) * shadow, a * .8);
          ${TONE}
        }`,
    }),
  );
}

export interface Body {
  def: BodyDef;
  index: number;
  body: Group;
  uniforms: Record<string, { value: unknown }> & {
    uSunL: { value: Vector3 };
    uCamL: { value: Vector3 };
    uSites: { value: Vector4[] };
  };
  airUniforms: { uStrength: { value: number } } | null;
  rings: Mesh<BufferGeometry, ShaderMaterial> | null;
  pos: Vector3;
  /** A moon's place from its parent, before the parent's drawn size pushes it out. */
  offset: Vector3;
  quat: Quaternion;
  qTilt: Quaternion;
  scale: number;
  radius: number;
}

function makeBody(def: BodyDef, index: number): Body {
  const body = new Group();
  const air = def.air;
  const zen = air ? col(air.zenith) : col('#000000');
  const ore = def.ore ? MINERALS[def.ore].color : '#ffffff';
  const uniforms = {
    uLow: { value: col(def.palette.low) },
    uHigh: { value: col(def.palette.high) },
    uAccent: { value: col(def.palette.accent) },
    uOre: { value: col(ore) },
    uVeins: { value: def.ore ? 1 : 0 },
    uSeed: { value: def.seed },
    uGas: { value: def.kind === 'gas' ? 1 : 0 },
    uR: { value: def.radius },
    uSunL: { value: new Vector3(1, 0, 0) },
    uCamL: { value: new Vector3(0, 0, 1e6) },
    uSun: { value: new Color(1, 1, 1).multiplyScalar(SUN_STRENGTH) },
    uSunsetTint: { value: air ? col(air.sunset).lerp(col('#ffffff'), 0.45) : col('#ffffff') },
    uAmbDay: {
      value: air
        ? zen
            .clone()
            .multiplyScalar(0.5 * air.density)
            .addScalar(0.12)
        : new Color(0.05, 0.05, 0.05),
    },
    uAmbNight: { value: new Color(0.034, 0.04, 0.062) },
    uRim: { value: air ? col(air.rim) : col('#000000') },
    uLamp: { value: col(ink.lamp).multiplyScalar(2.2) },
    uSites: { value: [0, 1, 2, 3].map(() => new Vector4()) },
    uHaze: { value: air ? 0.5 * air.density : 0 },
  };
  body.add(
    new Mesh(
      new SphereGeometry(def.radius, 96, 48),
      new ShaderMaterial({ uniforms, vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG }),
    ),
  );
  let airUniforms: Body['airUniforms'] = null;
  if (air) {
    const ra = def.radius + air.height * (def.kind === 'gas' ? 1 : 1.6);
    const au = {
      uCamL: uniforms.uCamL,
      uSunL: uniforms.uSunL,
      uRim: uniforms.uRim,
      uSunsetTint: { value: col(air.sunset) },
      uR: { value: def.radius },
      uRa: { value: ra },
      uStrength: { value: air.density },
    };
    airUniforms = au;
    body.add(
      new Mesh(
        new SphereGeometry(ra, 64, 32),
        new ShaderMaterial({
          side: BackSide,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          uniforms: au,
          vertexShader:
            'varying vec3 vLocal; void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
          fragmentShader: AIR_FRAG,
        }),
      ),
    );
  }
  const rings = def.rings ? makeRings(def, uniforms.uSunL) : null;
  if (rings) body.add(rings);
  return {
    def,
    index,
    body,
    uniforms,
    airUniforms,
    rings,
    pos: new Vector3(),
    offset: new Vector3(),
    quat: new Quaternion(),
    qTilt: new Quaternion().setFromAxisAngle(Z, def.tilt),
    scale: 1,
    radius: def.radius,
  };
}

export interface Bodies {
  root: Group;
  star: Star;
  bodies: Body[];
  byId(id: string): Body;
  /** Step 1 of a frame: where everything is at `days` of game time. Luna turns to `lunaQuat`. */
  update(days: number, lunaQuat: Quaternion): void;
  /** Step 2, once the camera is known (system units): display scales and view uniforms. */
  place(cam: Vector3, focus: Body | null): void;
  dispose(): void;
}

export function createBodies(glow: Texture): Bodies {
  const root = new Group();
  const star = makeStar(glow);
  root.add(star.group);
  const bodies = SOL.map(makeBody);
  const orbitMaterial = new LineBasicMaterial({
    color: col(ink.brass),
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const orbits = new Group();
  for (const b of bodies) {
    root.add(b.body);
    if (b.def.parent) continue;
    const pts: Vector3[] = [];
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * TAU;
      pts.push(new Vector3(Math.cos(a) * b.def.orbit, 0, Math.sin(a) * b.def.orbit));
    }
    orbits.add(new LineLoop(new BufferGeometry().setFromPoints(pts), orbitMaterial));
  }
  root.add(orbits);
  const byId = (id: string): Body => bodies.find((b) => b.def.id === id)!;
  const qSpin = new Quaternion();
  const qInv = new Quaternion();
  const v = new Vector3();
  return {
    root,
    star,
    bodies,
    byId,
    update(days, lunaQuat) {
      star.uniforms.uTime.value = days * 60;
      for (const b of bodies) {
        if (b.def.parent) continue;
        const a = b.def.phase + (days * TAU) / b.def.period;
        b.pos.set(Math.cos(a) * b.def.orbit, 0, -Math.sin(a) * b.def.orbit);
        const spin = b.def.day ? (days * TAU) / b.def.day : 0;
        b.quat.copy(b.qTilt).multiply(qSpin.setFromAxisAngle(Y, spin));
      }
      for (const b of bodies) {
        if (!b.def.parent) continue;
        const a = b.def.phase + (days * TAU) / b.def.period;
        b.offset.set(Math.cos(a) * b.def.orbit, 0, -Math.sin(a) * b.def.orbit);
        b.pos.copy(byId(b.def.parent).pos).add(b.offset);
        b.quat.copy(lunaQuat);
      }
    },
    place(cam, focus) {
      star.scale = displayScale(cam.length(), star.radius * 1.5, 0.9);
      star.group.scale.setScalar(star.scale);
      for (const b of bodies) {
        if (b.def.parent) continue;
        b.scale = displayScale(v.copy(cam).sub(b.pos).length(), b.radius, 0.72);
      }
      for (const b of bodies) {
        const parent = b.def.parent ? byId(b.def.parent) : null;
        if (parent) {
          // A moon keeps clear of its parent when the parent is drawn larger than life.
          b.pos.copy(parent.pos).addScaledVector(b.offset, Math.max(1, parent.scale * 1.1));
          b.scale = displayScale(v.copy(cam).sub(b.pos).length(), b.radius, 0.72);
        }
        b.body.position.copy(b.pos);
        b.body.quaternion.copy(b.quat);
        b.body.scale.setScalar(b.scale);
        qInv.copy(b.quat).invert();
        b.uniforms.uCamL.value.copy(cam).sub(b.pos).applyQuaternion(qInv).divideScalar(b.scale);
        b.uniforms.uSunL.value.copy(b.pos).negate().normalize().applyQuaternion(qInv);
      }
      // An orbit line runs through its world: fade the lines near the body in focus.
      const near = focus ? v.copy(cam).sub(focus.pos).length() : Infinity;
      orbitMaterial.opacity = focus
        ? 0.3 * Math.min(1, Math.max(0, (near - focus.radius * 8) / (focus.radius * 22)))
        : 0.3;
      orbits.visible = orbitMaterial.opacity > 0.003;
    },
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mat = m.material;
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
      });
    },
  };
}

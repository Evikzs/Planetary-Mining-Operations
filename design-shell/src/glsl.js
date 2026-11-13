// Shared GLSL. The globe and the colony terrain call the same surfaceAlbedo(),
// so the ground matches where the two meshes meet.

export const NOISE = /* glsl */ `
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s / .9375; }
`;

export const SURFACE = /* glsl */ `
uniform vec3 uLow, uHigh, uAccent, uOre;
uniform float uSeed, uGas;
// p: planet-local position in metres. px: metres per pixel (fades fine grain). Returns linear albedo.
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
  // Ore veins: thin lines where ridged noise peaks. This is the glimmer you see from orbit.
  float r = 1. - abs(2. * fbm(n * 6. + uSeed * 3.1) - 1.);
  vein = smoothstep(.945, .992, r) * smoothstep(.42, .62, fbm(n * 3. + uSeed * 5.3));
  // Near the ground a vein breaks into patches of ore in the rock.
  vein *= mix(.25 + .75 * smoothstep(.4, .62, .6 * vnoise(p * .011) + .4 * vnoise(p * .06)), 1., smoothstep(4., 30., px));
  c = mix(c, uOre * (.45 + .6 * mid), vein * .7);
  hgt = cont + mid * .3;
  float g = 1.;
  g *= mix(1., .8 + .4 * vnoise(p * .02), 1. - smoothstep(12., 50., px));
  g *= mix(1., .86 + .28 * vnoise(p * .23), 1. - smoothstep(1., 4.5, px));
  g *= mix(1., .9 + .2 * vnoise(p * 1.9), 1. - smoothstep(.12, .6, px));
  return c * g;
}
`;

// How much the daytime air hides the stars. mu: view elevation (0 horizon, 1 zenith), e: sun elevation.
export const VEIL = /* glsl */ `
float skyVeil(float m, float e, float density) {
  float hz = pow(1. - m, 4.);
  float day = smoothstep(-.14, .12, e);
  float twi = smoothstep(-.3, -.02, e) * (1. - smoothstep(.02, .4, e));
  return density * clamp(day * (.82 + .18 * hz) + twi * hz * .9 + .05 * hz, 0., 1.);
}
`;

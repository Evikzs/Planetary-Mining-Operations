// Shared GLSL from Fable's shell: hash and value noise, and how much daytime air hides the stars.

export const NOISE = /* glsl */ `
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s / .9375; }
`;

/** Tone mapping and colour space, for ShaderMaterials drawn straight to the screen. */
export const TONE = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

/**
 * Night at a point: 0 in full sun, 1 once the sun is well under its horizon. `up` is the point's
 * direction from the Moon's centre (the world origin), `sun` the unit vector to the sun.
 */
export const NIGHT = /* glsl */ `
float nightAt(vec3 up, vec3 sun){ return 1. - smoothstep(-.1, .12, dot(normalize(up), sun)); }
`;

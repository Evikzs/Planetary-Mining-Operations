import { Color, Vector2, type Texture } from 'three';
import { palette } from '../../ui/tokens';

/**
 * The print look in one pass: colour plates a little out of register, ink outlines where
 * depth jumps, halftone dots in the shadows, then paper grain.
 */
export const PosterShader = {
  name: 'PosterShader',
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    tDepth: { value: null as Texture | null },
    tPaper: { value: null as Texture | null },
    resolution: { value: new Vector2(1, 1) },
    dpr: { value: 1 },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    ink: { value: new Color(palette.offBlack) },
    shade: { value: new Color(palette.navy) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    #define EDGE 0.02
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tPaper;
    uniform vec2 resolution;
    uniform float dpr;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 ink;
    uniform vec3 shade;
    varying vec2 vUv;

    float viewDepth(vec2 uv) {
      return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
    }

    void main() {
      vec2 texel = 1.0 / resolution;

      // Print offset: the red plate sits 0.6 px right, the blue plate 0.6 px left.
      float shift = 0.6 * texel.x;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + vec2(shift, 0.0)).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - vec2(shift, 0.0)).b
      );

      // Outline where depth breaks: the second difference of view depth, relative to depth.
      // A slope only bends depth gently, so ground seen at a low angle stays clean.
      float c = viewDepth(vUv);
      float l = viewDepth(vUv - vec2(texel.x, 0.0));
      float r = viewDepth(vUv + vec2(texel.x, 0.0));
      float b = viewDepth(vUv - vec2(0.0, texel.y));
      float t = viewDepth(vUv + vec2(0.0, texel.y));
      float crease = max(abs(l + r - 2.0 * c), abs(t + b - 2.0 * c)) / max(c, 1e-4);
      col = mix(col, ink, step(EDGE, crease));

      // Halftone in the shadows: 5 px cells at 15 degrees, dots grow as it darkens.
      float lum = dot(pow(max(col, 0.0), vec3(1.0 / 2.2)), vec3(0.2126, 0.7152, 0.0722));
      if (lum < 0.45) {
        float a = radians(15.0);
        float cell = 5.0 * dpr;
        vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * (vUv * resolution) / cell;
        float radius = (0.45 - lum) / 0.45 * 0.55;
        float aa = 1.0 / cell;
        float dotMask = 1.0 - smoothstep(radius - aa, radius + aa, length(fract(p) - 0.5));
        col = mix(col, mix(col, shade, 0.5), dotMask);
      }

      // Paper grain.
      col *= 0.94 + 0.06 * texture2D(tPaper, vUv * resolution / 256.0).r;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

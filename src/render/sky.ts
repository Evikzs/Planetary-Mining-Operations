import {
  BufferGeometry,
  Float32BufferAttribute,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  type Camera,
  type WebGLRenderer,
} from 'three';
import { createRng, deriveSeed } from '../sim/rng';
import { palette } from '../ui/tokens';

export const STAR_COUNT = 600;
export const STAR_RADIUS = 3000;

/** Seeded star positions, uniform on a sphere of STAR_RADIUS around the viewer. */
export function starPositions(seed: number): Float32Array {
  const rng = createRng(deriveSeed(seed, 'stars'));
  const out = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const z = 2 * rng.next() - 1;
    const a = 2 * Math.PI * rng.next();
    const r = Math.sqrt(1 - z * z);
    out.set([r * Math.cos(a) * STAR_RADIUS, r * Math.sin(a) * STAR_RADIUS, z * STAR_RADIUS], i * 3);
  }
  return out;
}

export interface Sky {
  render(renderer: WebGLRenderer, view: Camera): void;
  setAspect(aspect: number): void;
  dispose(): void;
}

/**
 * Stars live in their own scene and camera: the main camera's far plane
 * (altitude + 3R) is far shorter than the star sphere.
 */
export function createSky(seed: number, fov: number): Sky {
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, 1, STAR_RADIUS * 2);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(starPositions(seed), 3));
  const material = new PointsMaterial({ color: palette.cream, size: 1.5, sizeAttenuation: false });
  scene.add(new Points(geometry, material));
  return {
    render(renderer, view) {
      camera.quaternion.copy(view.quaternion);
      renderer.render(scene, camera);
    },
    setAspect(aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

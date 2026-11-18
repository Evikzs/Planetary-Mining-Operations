import {
  HalfFloatType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type Quality = 'high' | 'low';

export interface Composer {
  render(): void;
  /** Draws another scene from another camera: the view of Sol uses the same chain. */
  setView(scene: Scene, camera: Camera): void;
  setSize(w: number, h: number, dpr: number): void;
  /** Bloom strength: a little more at night, when the lamps carry the scene. */
  setBloom(strength: number): void;
  dispose(): void;
}

/**
 * Fable's chain: the scene into a half-float target with 4× MSAA, bloom on what is brighter than
 * white, then tone mapping and colour space. Low quality draws straight to the screen.
 */
export function createComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  quality: Quality,
): Composer {
  if (quality === 'low') {
    let view = { scene, camera };
    return {
      render: () => renderer.render(view.scene, view.camera),
      setView: (s, c) => (view = { scene: s, camera: c }),
      setSize: () => undefined,
      setBloom: () => undefined,
      dispose: () => undefined,
    };
  }
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.3, 0.4, 1.05);
  const pass = new RenderPass(scene, camera);
  composer.addPass(pass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setView(s, c) {
      pass.scene = s;
      pass.camera = c;
    },
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    },
    setBloom(strength) {
      bloom.strength = strength;
    },
    dispose() {
      composer.dispose();
      bloom.dispose();
    },
  };
}

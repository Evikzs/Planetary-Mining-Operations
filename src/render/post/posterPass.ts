import {
  DepthTexture,
  HalfFloatType,
  WebGLRenderTarget,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { paperTexture } from './paperTexture';
import { PosterShader } from './posterShader';

/** Draws whatever sits behind the world: the sky, whose colour background also clears the frame. */
class BackgroundPass extends Pass {
  constructor(private readonly draw: (renderer: WebGLRenderer) => void) {
    super();
    this.needsSwap = false;
  }

  override render(
    renderer: WebGLRenderer,
    _write: WebGLRenderTarget,
    read: WebGLRenderTarget,
  ): void {
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    this.draw(renderer);
  }
}

/** The poster shader, fed the depth of the frame it reads. */
class PosterPass extends ShaderPass {
  constructor(private readonly camera: PerspectiveCamera) {
    super(PosterShader);
  }

  override render(
    renderer: WebGLRenderer,
    write: WebGLRenderTarget,
    read: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const u = this.uniforms as typeof PosterShader.uniforms;
    u.tDepth.value = read.depthTexture;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    super.render(renderer, write, read, deltaTime, maskActive);
  }
}

/** Background, world, poster look, then colour output. */
export function createPosterComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  background: (renderer: WebGLRenderer) => void = () => undefined,
): { render(): void; setSize(w: number, h: number, dpr: number): void; dispose(): void } {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  target.depthTexture = new DepthTexture(1, 1);
  const composer = new EffectComposer(renderer, target);
  const world = new RenderPass(scene, camera);
  world.clear = false;
  world.clearDepth = true;
  const poster = new PosterPass(camera as PerspectiveCamera);
  const paper = paperTexture(1);
  const u = poster.uniforms as typeof PosterShader.uniforms;
  u.tPaper.value = paper;
  composer.addPass(new BackgroundPass(background));
  composer.addPass(world);
  composer.addPass(poster);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize(w, h, dpr) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      u.resolution.value.set(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
      u.dpr.value = dpr;
    },
    dispose() {
      composer.dispose();
      paper.dispose();
    },
  };
}

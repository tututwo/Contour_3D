import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";
import { ColorCorrectionShader } from "three/addons/shaders/ColorCorrectionShader.js";

export const createComposer = ({ renderer, scene, camera, settings, sizes }) => {
  if (!settings.post.enabled) {
    return { composer: null, fxaaPass: null, bloomPass: null };
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let bloomPass = null;
  if (settings.post.bloom.enabled) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(sizes.width, sizes.height),
      settings.post.bloom.strength,
      settings.post.bloom.radius,
      settings.post.bloom.threshold,
    );
    composer.addPass(bloomPass);
  }

  if (settings.post.color.enabled) {
    const colorPass = new ShaderPass(ColorCorrectionShader);
    colorPass.uniforms["powRGB"].value.set(
      settings.post.color.pow[0],
      settings.post.color.pow[1],
      settings.post.color.pow[2],
    );
    colorPass.uniforms["mulRGB"].value.set(
      settings.post.color.mul[0],
      settings.post.color.mul[1],
      settings.post.color.mul[2],
    );
    composer.addPass(colorPass);
  }

  if (settings.post.vignette.enabled) {
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = settings.post.vignette.offset;
    vignettePass.uniforms["darkness"].value = settings.post.vignette.darkness;
    composer.addPass(vignettePass);
  }

  let fxaaPass = null;
  if (settings.post.fxaa.enabled) {
    fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms["resolution"].value.set(
      1 / (sizes.width * sizes.pixelRatio),
      1 / (sizes.height * sizes.pixelRatio),
    );
    composer.addPass(fxaaPass);
  }

  return { composer, fxaaPass, bloomPass };
};

import * as THREE from "three";

export const createRenderer = ({ canvas, sizes, settings }) => {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(settings.background);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;

  return renderer;
};

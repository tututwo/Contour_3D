export const attachResizeHandler = ({
  sizes,
  camera,
  renderer,
  composer,
  fxaaPass,
  bloomPass,
  updateOrthoFrustum,
  getFramingData,
  updateLineResolution,
}) => {
  window.addEventListener("resize", () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;
    sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

    if (camera.isPerspectiveCamera) {
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
    } else if (camera.isOrthographicCamera) {
      const framing = getFramingData();
      if (framing) {
        updateOrthoFrustum({ size: framing.size });
      }
    }

    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(sizes.pixelRatio);

    if (composer) {
      composer.setSize(sizes.width, sizes.height);
      if (fxaaPass) {
        fxaaPass.material.uniforms["resolution"].value.set(
          1 / (sizes.width * sizes.pixelRatio),
          1 / (sizes.height * sizes.pixelRatio),
        );
      }
      if (bloomPass) {
        bloomPass.resolution.set(sizes.width, sizes.height);
      }
    }

    if (updateLineResolution) {
      updateLineResolution({ width: sizes.width, height: sizes.height, pixelRatio: sizes.pixelRatio });
    }
  });
};

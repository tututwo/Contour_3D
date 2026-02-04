import { SETTINGS } from "./config/settings.js";
import { createScene } from "./core/scene.js";
import { createCameras, frameCamera, updateOrthoFrustum } from "./core/camera.js";
import { createRenderer } from "./core/renderer.js";
import { createControls } from "./core/controls.js";
import { addLights } from "./core/lights.js";
import { attachResizeHandler } from "./core/resize.js";
import { loadTerrain } from "./data/loadTerrain.js";
import { computeClamp } from "./data/normalize.js";
import { buildRibbons } from "./geometry/ribbon.js";
import { buildStrokes } from "./geometry/stroke.js";
import { createStrokeMaterial } from "./materials/strokeMaterial.js";
import { createComposer } from "./post/composer.js";

const canvas = document.querySelector("canvas.webgl");

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

const scene = createScene(SETTINGS);

const { camera, perspectiveCamera, orthoCamera } = createCameras(SETTINGS, sizes);
scene.add(camera);

const renderer = createRenderer({ canvas, sizes, settings: SETTINGS });
addLights(scene);

const controls = createControls({ camera, canvas });

const { composer, fxaaPass, bloomPass } = createComposer({
  renderer,
  scene,
  camera,
  settings: SETTINGS,
  sizes,
});

let framingData = null;
let updateLineResolution = null;
let strokeGroup = null;

const init = async () => {
  const { meta, values } = await loadTerrain(SETTINGS);
  const { clampLow, clampHigh } = computeClamp(meta, values);

  const { group, bounds, strokePoints, layout } = buildRibbons({
    meta,
    values,
    clampLow,
    clampHigh,
    settings: SETTINGS,
  });

  scene.add(group);

  framingData = bounds;

  if (SETTINGS.visual.useFog && scene.fog) {
    scene.fog.near = bounds.maxDim * SETTINGS.fog.near;
    scene.fog.far = bounds.maxDim * SETTINGS.fog.far;
  }

  frameCamera({
    camera,
    orthoCamera,
    sizes,
    bounds,
    settings: SETTINGS,
  });

  controls.target.copy(bounds.center);
  controls.update();

  if (SETTINGS.stroke.enabled) {
    const strokeMaterialContext = createStrokeMaterial({
      settings: SETTINGS,
      sizes,
    });
    updateLineResolution = strokeMaterialContext.updateResolution;

    strokeGroup = buildStrokes({
      strokePoints,
      settings: SETTINGS,
      material: strokeMaterialContext.material,
      camera,
      sizes,
      dxStep: layout.dxStep,
    });

    group.add(strokeGroup);

    if (
      SETTINGS.stroke.mode === "tube" &&
      SETTINGS.stroke.followZoom &&
      camera.isOrthographicCamera
    ) {
      controls.addEventListener("change", () => {
        group.remove(strokeGroup);
        strokeGroup = buildStrokes({
          strokePoints,
          settings: SETTINGS,
          material: strokeMaterialContext.material,
          camera,
          sizes,
          dxStep: layout.dxStep,
        });
        group.add(strokeGroup);
      });
    }
  }

  const updateOrtho = ({ size }) =>
    updateOrthoFrustum({ orthoCamera, sizes, size, settings: SETTINGS });

  attachResizeHandler({
    sizes,
    camera,
    renderer,
    composer,
    fxaaPass,
    bloomPass,
    updateOrthoFrustum: updateOrtho,
    getFramingData: () => framingData,
    updateLineResolution,
  });
};

init().catch((error) => {
  console.error(error);
});

const tick = () => {
  controls.update();
  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  window.requestAnimationFrame(tick);
};

tick();

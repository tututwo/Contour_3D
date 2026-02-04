import * as THREE from "three";
import heightVert from "../shaders/ribbon/height.vert.glsl";
import heightFrag from "../shaders/ribbon/height.frag.glsl";

export const createRibbonMaterial = ({ settings, color }) => {
  const baseOptions = {
    color,
    transparent: true,
    opacity: settings.ribbon.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: settings.visual.useFog,
  };

  const material = settings.visual.useLambert
    ? new THREE.MeshLambertMaterial(baseOptions)
    : new THREE.MeshBasicMaterial(baseOptions);

  material.toneMapped = false;
  return material;
};

export const createHeightMaterial = ({ zMin, zMax, colorLow, colorHigh, opacity }) => {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      zMin: { value: zMin },
      zMax: { value: zMax },
      colorLow: { value: new THREE.Color(colorLow) },
      colorHigh: { value: new THREE.Color(colorHigh) },
      opacity: { value: opacity },
    },
    vertexShader: heightVert,
    fragmentShader: heightFrag,
  });

  return material;
};

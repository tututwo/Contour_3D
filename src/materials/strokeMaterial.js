import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export const createStrokeMaterial = ({ settings, sizes }) => {
  if (!settings.stroke.enabled) {
    return { material: null, type: null, updateResolution: null };
  }

  if (settings.stroke.mode === "line2") {
    const material = new LineMaterial({
      color: new THREE.Color(settings.stroke.color),
      linewidth: settings.stroke.width,
      transparent: true,
      opacity: settings.stroke.opacity,
      depthWrite: false,
    });
    material.resolution.set(
      sizes.width * sizes.pixelRatio,
      sizes.height * sizes.pixelRatio,
    );
    material.toneMapped = false;

    const updateResolution = ({ width, height, pixelRatio }) => {
      material.resolution.set(width * pixelRatio, height * pixelRatio);
    };

    return { material, type: "line2", updateResolution };
  }

  if (settings.stroke.mode === "tube") {
    const material = new THREE.MeshBasicMaterial({
      color: settings.stroke.color,
      transparent: true,
      opacity: settings.stroke.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: settings.visual.useFog,
    });
    material.toneMapped = false;
    return { material, type: "tube", updateResolution: null };
  }

  const material = new THREE.LineBasicMaterial({
    color: settings.stroke.color,
    linewidth: settings.stroke.width,
    transparent: true,
    opacity: settings.stroke.opacity,
    depthWrite: false,
  });
  material.toneMapped = false;

  return { material, type: "line", updateResolution: null };
};

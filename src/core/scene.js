import * as THREE from "three";

export const createScene = (settings) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(settings.background);
  if (settings.visual.useFog) {
    scene.fog = new THREE.Fog(settings.background, settings.fog.near, settings.fog.far);
  }
  return scene;
};

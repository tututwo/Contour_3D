import * as THREE from "three";

export const addLights = (scene) => {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
  directionalLight.position.set(6, -10, 12);

  scene.add(ambientLight, directionalLight);
  return { ambientLight, directionalLight };
};

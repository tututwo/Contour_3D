import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const createControls = ({ camera, canvas }) => {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.8;
  controls.enableRotate = true;
  controls.enableZoom = true;
  return controls;
};

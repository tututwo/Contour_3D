import * as THREE from "three";

export const createCameras = (settings, sizes) => {
  const perspectiveCamera = new THREE.PerspectiveCamera(
    35,
    sizes.width / sizes.height,
    0.1,
    1000,
  );
  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

  const camera = settings.cameraMode === "ortho" ? orthoCamera : perspectiveCamera;
  camera.up.set(0, 0, 1);

  return { camera, perspectiveCamera, orthoCamera };
};

export const updateOrthoFrustum = ({ orthoCamera, sizes, size, settings }) => {
  const aspect = sizes.width / sizes.height;
  const frustumHeight = Math.max(size.y, 1e-6) * settings.ortho.padding;
  const frustumWidth = frustumHeight * aspect;

  orthoCamera.left = -frustumWidth / 2;
  orthoCamera.right = frustumWidth / 2;
  orthoCamera.top = frustumHeight / 2;
  orthoCamera.bottom = -frustumHeight / 2;
  orthoCamera.zoom = settings.ortho.zoom;
  orthoCamera.updateProjectionMatrix();
};

export const frameCamera = ({ camera, orthoCamera, sizes, bounds, settings }) => {
  const { size, center, maxDim } = bounds;

  if (camera.isOrthographicCamera) {
    updateOrthoFrustum({ orthoCamera, sizes, size, settings });
  }

  camera.near = maxDim / 100;
  camera.far = maxDim * 20;
  camera.updateProjectionMatrix();

  camera.position.set(
    center.x + size.x * 0.2,
    center.y - size.y * 1.2,
    center.z + size.z * 1.2,
  );

  return { maxDim };
};

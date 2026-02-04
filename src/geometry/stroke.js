import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";

const computeStrokeRadius = ({ camera, sizes, settings, dxStep }) => {
  if (settings.stroke.mode !== "tube") return 0;

  if (camera.isOrthographicCamera) {
    const viewHeight = (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
    const pixelsPerUnit = sizes.height / Math.max(viewHeight, 1e-6);
    const targetPixels = settings.stroke.width;
    return targetPixels / Math.max(pixelsPerUnit, 1e-6);
  }

  return settings.stroke.tube.radius * dxStep;
};

const buildStroke = ({ points, settings, material, camera, sizes, dxStep }) => {
  if (!settings.stroke.enabled) return null;

  if (settings.stroke.mode === "tube") {
    const curvePoints = [];
    for (let i = 0; i < points.length; i += 3) {
      curvePoints.push(new THREE.Vector3(points[i], points[i + 1], points[i + 2]));
    }

    const curve = new THREE.CatmullRomCurve3(curvePoints, false, "centripetal");
    const tubularSegments = Math.max(
      2,
      Math.floor((curvePoints.length - 1) * settings.stroke.tube.tubularSegmentsScale),
    );
    const radius = computeStrokeRadius({ camera, sizes, settings, dxStep });

    const geometry = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      radius,
      settings.stroke.tube.radialSegments,
      false,
    );

    return new THREE.Mesh(geometry, material);
  }

  if (settings.stroke.mode === "line2") {
    const geometry = new LineGeometry();
    geometry.setPositions(points);
    return new Line2(geometry, material);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
  return new THREE.Line(geometry, material);
};

export const buildStrokes = ({
  strokePoints,
  settings,
  material,
  camera,
  sizes,
  dxStep,
}) => {
  const group = new THREE.Group();

  strokePoints.forEach((points, index) => {
    const stroke = buildStroke({ points, settings, material, camera, sizes, dxStep });
    if (!stroke) return;

    stroke.renderOrder = index + 1;
    group.add(stroke);
  });

  return group;
};

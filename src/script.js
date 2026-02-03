import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";
import { ColorCorrectionShader } from "three/addons/shaders/ColorCorrectionShader.js";

const SETTINGS = {
  dataRoot: "./data",
  metersToUnits: 1 / 1000,
  depthScale: 1.0,
  zScaleFactor: 0.18,
  cameraMode: "ortho", // "ortho" | "perspective"
  ortho: {
    padding: 1.15,
    zoom: 1,
  },
  ribbon: {
    opacity: 0.28,
    baseHeight: 0,
    rowStep: 2,
    colStep: 1,
    rowGap: 1.6, // new: >1 increases spacing
  },
  background: "#f2f4f7",
  fog: {
    near: 0.6,
    far: 2.2,
  },
  visual: {
    useFog: false,
    useLambert: false,
  },
  post: {
    enabled: true,
    bloom: { enabled: true, strength: 0.35, radius: 0.4, threshold: 0.85 },
    color: { enabled: true, pow: [0.95, 0.95, 0.95], mul: [1.08, 1.08, 1.08] },
    vignette: { enabled: true, offset: 1.0, darkness: 0.85 },
    fxaa: { enabled: true },
  },
  stroke: {
    enabled: true,
    color: "#000000",
    opacity: 1,
    zOffset: 0.01,
    width: 1010,
  },
  colorMode: "row", // 'row' | 'height'
  trim: {
    rows: 10,
    cols: 10,
  },
  rowGradient: [
    { t: 0.0, color: "#D75172" },
    { t: 0.5, color: "#EEA454" },
    { t: 0.75, color: "#D10263" },
    { t: 1.0, color: "#8C0E96" },
  ],
  heightGradient: {
    low: "#FA4CFB",
    high: "#93F3E9",
  },
};

const canvas = document.querySelector("canvas.webgl");

const scene = new THREE.Scene();
scene.background = new THREE.Color(SETTINGS.background);
if (SETTINGS.visual.useFog) {
  scene.fog = new THREE.Fog(SETTINGS.background, SETTINGS.fog.near, SETTINGS.fog.far);
}

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

const perspectiveCamera = new THREE.PerspectiveCamera(
  35,
  sizes.width / sizes.height,
  0.1,
  1000,
);
const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

let camera =
  SETTINGS.cameraMode === "ortho" ? orthoCamera : perspectiveCamera;
camera.up.set(0, 0, 1);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(SETTINGS.background);
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(6, -10, 12);
scene.add(ambientLight, directionalLight);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.8;
controls.enableRotate = true;
controls.enableZoom = true;

let composer = null;
let renderPass = null;
let bloomPass = null;
let colorPass = null;
let vignettePass = null;
let fxaaPass = null;

const initPostProcessing = () => {
  if (!SETTINGS.post.enabled) return;

  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  if (SETTINGS.post.bloom.enabled) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(sizes.width, sizes.height),
      SETTINGS.post.bloom.strength,
      SETTINGS.post.bloom.radius,
      SETTINGS.post.bloom.threshold,
    );
    composer.addPass(bloomPass);
  }

  if (SETTINGS.post.color.enabled) {
    colorPass = new ShaderPass(ColorCorrectionShader);
    colorPass.uniforms["powRGB"].value.set(
      SETTINGS.post.color.pow[0],
      SETTINGS.post.color.pow[1],
      SETTINGS.post.color.pow[2],
    );
    colorPass.uniforms["mulRGB"].value.set(
      SETTINGS.post.color.mul[0],
      SETTINGS.post.color.mul[1],
      SETTINGS.post.color.mul[2],
    );
    composer.addPass(colorPass);
  }

  if (SETTINGS.post.vignette.enabled) {
    vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = SETTINGS.post.vignette.offset;
    vignettePass.uniforms["darkness"].value = SETTINGS.post.vignette.darkness;
    composer.addPass(vignettePass);
  }

  if (SETTINGS.post.fxaa.enabled) {
    fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms["resolution"].value.set(
      1 / (sizes.width * sizes.pixelRatio),
      1 / (sizes.height * sizes.pixelRatio),
    );
    composer.addPass(fxaaPass);
  }
};

initPostProcessing();

let framingData = null;

const updateOrthoFrustum = (size) => {
  const aspect = sizes.width / sizes.height;
  const frustumHeight = Math.max(size.y, 1e-6) * SETTINGS.ortho.padding;
  const frustumWidth = frustumHeight * aspect;

  orthoCamera.left = -frustumWidth / 2;
  orthoCamera.right = frustumWidth / 2;
  orthoCamera.top = frustumHeight / 2;
  orthoCamera.bottom = -frustumHeight / 2;
  orthoCamera.zoom = SETTINGS.ortho.zoom;
  orthoCamera.updateProjectionMatrix();
};

window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

  if (camera.isPerspectiveCamera) {
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();
  } else if (camera.isOrthographicCamera && framingData) {
    updateOrthoFrustum(framingData.size);
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
});

const linesGroup = new THREE.Group();
scene.add(linesGroup);

function sampleGradient(t, stops) {
  const clamped = Math.min(Math.max(t, 0), 1);

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    if (clamped >= a.t && clamped <= b.t) {
      const localT = (clamped - a.t) / (b.t - a.t);
      return new THREE.Color(a.color).lerp(new THREE.Color(b.color), localT);
    }
  }

  return new THREE.Color(stops[stops.length - 1].color);
}

function createHeightMaterial({ zMin, zMax, colorLow, colorHigh, opacity }) {
  return new THREE.ShaderMaterial({
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
    vertexShader: `
      varying float vHeight;

      void main() {
        vHeight = position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float zMin;
      uniform float zMax;
      uniform vec3 colorLow;
      uniform vec3 colorHigh;
      uniform float opacity;

      varying float vHeight;

      void main() {
        float t = clamp((vHeight - zMin) / (zMax - zMin), 0.0, 1.0);
        vec3 color = mix(colorLow, colorHigh, t);
        gl_FragColor = vec4(color, opacity);
      }
    `,
  });
}

function computeQuantile(sortedValues, quantile) {
  if (sortedValues.length === 0) return 0;
  if (quantile <= 0) return sortedValues[0];
  if (quantile >= 1) return sortedValues[sortedValues.length - 1];

  const index = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const t = index - lower;

  if (upper === lower) return sortedValues[lower];
  return sortedValues[lower] * (1 - t) + sortedValues[upper] * t;
}

async function loadRidgelines() {
  const metaUrl = `${SETTINGS.dataRoot}/meta.json`;
  const valuesUrl = `${SETTINGS.dataRoot}/values.bin`;

  const [metaResponse, valuesResponse] = await Promise.all([
    fetch(metaUrl),
    fetch(valuesUrl),
  ]);

  if (!metaResponse.ok)
    throw new Error(`Failed to load meta.json (${metaResponse.status})`);
  if (!valuesResponse.ok)
    throw new Error(`Failed to load values.bin (${valuesResponse.status})`);

  const meta = await metaResponse.json();
  const buffer = await valuesResponse.arrayBuffer();
  const values = new Float32Array(buffer);

  const rows = meta.rows;
  const cols = meta.cols;

  let minValue = Infinity;
  let maxValue = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < minValue) minValue = v;
    if (v > maxValue) maxValue = v;
  }

  let clampLow = meta?.clampValues?.low;
  let clampHigh = meta?.clampValues?.high;

  if (
    meta?.clampPercentiles?.low !== undefined &&
    meta?.clampPercentiles?.high !== undefined
  ) {
    const sorted = Float32Array.from(values);
    sorted.sort();
    clampLow = computeQuantile(sorted, meta.clampPercentiles.low);
    clampHigh = computeQuantile(sorted, meta.clampPercentiles.high);
  } else if (!Number.isFinite(clampLow) || !Number.isFinite(clampHigh)) {
    clampLow = Number.isFinite(meta?.min) ? meta.min : minValue;
    clampHigh = Number.isFinite(meta?.max) ? meta.max : maxValue;
  }

  if (
    !Number.isFinite(clampLow) ||
    !Number.isFinite(clampHigh) ||
    clampHigh <= clampLow
  ) {
    clampLow = minValue;
    clampHigh = maxValue;
  }

  const range = Math.max(clampHigh - clampLow, 1e-6);

  if (values.length !== rows * cols)
    throw new Error(
      `values.bin length mismatch (expected ${rows * cols}, got ${values.length})`,
    );

  const extent = meta.extent_meters;
  const dxMeters = meta.dx ?? (extent.xmax - extent.xmin) / cols;
  const dyMeters = meta.dy ?? (extent.ymax - extent.ymin) / rows;

  const trimRows = Math.min(SETTINGS.trim.rows, Math.floor((rows - 1) / 2));
  const trimCols = Math.min(SETTINGS.trim.cols, Math.floor((cols - 1) / 2));
  const rowStart = trimRows;
  const rowEnd = rows - trimRows;
  const colStart = trimCols;
  const colEnd = cols - trimCols;
  const rowStep = Math.max(1, SETTINGS.ribbon.rowStep);
  const colStep = Math.max(1, SETTINGS.ribbon.colStep);

  const rowIndices = [];
  for (let i = rowStart; i < rowEnd; i += rowStep) rowIndices.push(i);

  const colIndices = [];
  for (let j = colStart; j < colEnd; j += colStep) colIndices.push(j);

  const usedRows = rowIndices.length;
  const usedCols = colIndices.length;

  if (usedRows <= 0 || usedCols <= 0) {
    throw new Error("Trim settings remove all rows or columns.");
  }

  const dx = dxMeters * SETTINGS.metersToUnits;
  const dy = dyMeters * SETTINGS.metersToUnits * SETTINGS.depthScale;
  const dxStep = dx * colStep;
  const dyStep = dy * rowStep * SETTINGS.ribbon.rowGap;

  const width = (usedCols - 1) * dxStep;
  const depth = (usedRows - 1) * dyStep;

  const xOffset = -width / 2;
  const yOffset = -depth / 2;

  const zScale = width * SETTINGS.zScaleFactor;

  let heightMaterial = null;
  if (SETTINGS.colorMode === "height") {
    heightMaterial = createHeightMaterial({
      zMin: 0,
      zMax: zScale,
      colorLow: SETTINGS.heightGradient.low,
      colorHigh: SETTINGS.heightGradient.high,
      opacity: SETTINGS.ribbon.opacity,
    });
  }

  const vertexCount = usedCols * 2;
  const indexCount = (usedCols - 1) * 6;
  const useUint32 = vertexCount > 65535;
  const strokeMaterial = SETTINGS.stroke.enabled
    ? new THREE.LineBasicMaterial({
        color: SETTINGS.stroke.color,
        linewidth: SETTINGS.stroke.width,
        transparent: true,
        opacity: SETTINGS.stroke.opacity,
        depthWrite: false,
      })
    : null;
  if (strokeMaterial) strokeMaterial.toneMapped = false;

  for (let r = 0; r < usedRows; r++) {
    const positions = new Float32Array(vertexCount * 3);
    const indices = useUint32
      ? new Uint32Array(indexCount)
      : new Uint16Array(indexCount);
    const strokePositions = SETTINGS.stroke.enabled
      ? new Float32Array(usedCols * 3)
      : null;

    const dataRowIndex = rowIndices[r];
    const tRow = usedRows > 1 ? r / (usedRows - 1) : 0;
    const rowColor = sampleGradient(tRow, SETTINGS.rowGradient);

    const yIndex = meta.rowOrder === "north_to_south" ? usedRows - 1 - r : r;
    const y = yOffset + yIndex * dyStep;

    for (let c = 0; c < usedCols; c++) {
      const dataColIndex = colIndices[c];
      const idx = dataRowIndex * cols + dataColIndex;
      const raw = values[idx];
      const clamped = Math.min(Math.max(raw, clampLow), clampHigh);
      const zNorm = (clamped - clampLow) / range;
      const z = zNorm * zScale;

      const x = xOffset + c * dxStep;

      const topIndex = c * 2;
      const baseIndex = topIndex + 1;

      positions[topIndex * 3 + 0] = x;
      positions[topIndex * 3 + 1] = y;
      positions[topIndex * 3 + 2] = z;

      positions[baseIndex * 3 + 0] = x;
      positions[baseIndex * 3 + 1] = y;
      positions[baseIndex * 3 + 2] = SETTINGS.ribbon.baseHeight;

      if (strokePositions) {
        const s3 = c * 3;
        strokePositions[s3 + 0] = x;
        strokePositions[s3 + 1] = y;
        strokePositions[s3 + 2] = z + SETTINGS.stroke.zOffset;
      }
    }

    for (let c = 0; c < usedCols - 1; c++) {
      const top0 = c * 2;
      const base0 = top0 + 1;
      const top1 = top0 + 2;
      const base1 = top0 + 3;

      const i6 = c * 6;
      indices[i6 + 0] = top0;
      indices[i6 + 1] = base0;
      indices[i6 + 2] = top1;

      indices[i6 + 3] = base0;
      indices[i6 + 4] = base1;
      indices[i6 + 5] = top1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    if (SETTINGS.visual.useLambert) geometry.computeVertexNormals();

    const material =
      heightMaterial ??
      (SETTINGS.visual.useLambert
        ? new THREE.MeshLambertMaterial({
            color: rowColor,
            transparent: true,
            opacity: SETTINGS.ribbon.opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: SETTINGS.visual.useFog,
          })
        : new THREE.MeshBasicMaterial({
            color: rowColor,
            transparent: true,
            opacity: SETTINGS.ribbon.opacity,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: SETTINGS.visual.useFog,
          }));
    material.toneMapped = false;

    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.renderOrder = r;
    linesGroup.add(ribbon);

    if (strokePositions && strokeMaterial) {
      const strokeGeometry = new THREE.BufferGeometry();
      strokeGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(strokePositions, 3),
      );
      const stroke = new THREE.Line(strokeGeometry, strokeMaterial);
      stroke.renderOrder = r + 1;
      linesGroup.add(stroke);
    }
  }

  // Frame the camera
  const box = new THREE.Box3().setFromObject(linesGroup);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 1);

  framingData = { size: size.clone(), center: center.clone() };

  if (SETTINGS.visual.useFog && scene.fog) {
    scene.fog.near = maxDim * SETTINGS.fog.near;
    scene.fog.far = maxDim * SETTINGS.fog.far;
  }

  if (camera.isOrthographicCamera) {
    updateOrthoFrustum(size);
  }

  camera.near = maxDim / 100;
  camera.far = maxDim * 20;
  camera.updateProjectionMatrix();

  camera.position.set(
    center.x + size.x * 0.2,
    center.y - size.y * 1.2,
    center.z + size.z * 1.2,
  );

  controls.target.copy(center);
  controls.update();

  // scene.fog = new THREE.Fog(SETTINGS.background, maxDim * 0.6, maxDim * 2.2)
}

loadRidgelines().catch((error) => {
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

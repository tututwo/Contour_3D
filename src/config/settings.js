export const SETTINGS = {
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
    opacity: 0.18,
    baseHeight: 0,
    rowStep: 2,
    colStep: 1,
    rowGap: 2,
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
    color: {
      enabled: true,
      pow: [0.95, 0.95, 0.95],
      mul: [1.08, 1.08, 1.08],
    },
    vignette: { enabled: true, offset: 1.0, darkness: 0.85 },
    fxaa: { enabled: true },
  },
  stroke: {
    enabled: true,
    color: "#ffffff",
    opacity: 1,
    zOffset: 0.01,
    width: 1,
    mode: "tube", // "tube" | "line2" | "line"
    followZoom: false,
    tube: {
      radius: 0.02,
      radialSegments: 6,
      tubularSegmentsScale: 1,
    },
  },
  colorMode: "row", // 'row' | 'height'
  trim: {
    rows: 10,
    cols: 10,
  },
  rowGradient: [
    { t: 0.0, color: "#5C585F" },
    { t: 0.09, color: "#2C217E" },
    { t: 0.18, color: "#2B20C1" },
    { t: 0.27, color: "#7F21A3" },
    { t: 0.36, color: "#8A2484" },
    { t: 0.45, color: "#AE338D" },
    { t: 0.55, color: "#C94F75" },
    { t: 0.64, color: "#ED874F" },
    { t: 0.73, color: "#D1B85C" },
    { t: 0.82, color: "#57CEC9" },
    { t: 0.91, color: "#ADE1DE" },
    { t: 1.0, color: "#E0E0DF" },
  ],
  heightGradient: {
    low: "#FA4CFB",
    high: "#93F3E9",
  },
};

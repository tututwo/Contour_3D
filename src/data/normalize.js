import { computeQuantile } from "../utils/math.js";

export const computeClamp = (meta, values) => {
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

  if (!Number.isFinite(clampLow) || !Number.isFinite(clampHigh) || clampHigh <= clampLow) {
    clampLow = minValue;
    clampHigh = maxValue;
  }

  const range = Math.max(clampHigh - clampLow, 1e-6);

  return {
    clampLow,
    clampHigh,
    range,
    minValue,
    maxValue,
  };
};

export const computeQuantile = (sortedValues, quantile) => {
  if (sortedValues.length === 0) return 0;
  if (quantile <= 0) return sortedValues[0];
  if (quantile >= 1) return sortedValues[sortedValues.length - 1];

  const index = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const t = index - lower;

  if (upper === lower) return sortedValues[lower];
  return sortedValues[lower] * (1 - t) + sortedValues[upper] * t;
};

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

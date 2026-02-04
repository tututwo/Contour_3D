export const loadTerrain = async (settings) => {
  const metaUrl = `${settings.dataRoot}/meta.json`;
  const valuesUrl = `${settings.dataRoot}/values.bin`;

  const [metaResponse, valuesResponse] = await Promise.all([
    fetch(metaUrl),
    fetch(valuesUrl),
  ]);

  if (!metaResponse.ok) {
    throw new Error(`Failed to load meta.json (${metaResponse.status})`);
  }
  if (!valuesResponse.ok) {
    throw new Error(`Failed to load values.bin (${valuesResponse.status})`);
  }

  const meta = await metaResponse.json();
  const buffer = await valuesResponse.arrayBuffer();
  const values = new Float32Array(buffer);

  const rows = meta.rows;
  const cols = meta.cols;
  if (values.length !== rows * cols) {
    throw new Error(
      `values.bin length mismatch (expected ${rows * cols}, got ${values.length})`,
    );
  }

  return { meta, values };
};

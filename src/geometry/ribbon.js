import * as THREE from "three";
import { sampleGradient } from "../utils/gradient.js";
import { clamp } from "../utils/math.js";
import { createRibbonMaterial, createHeightMaterial } from "../materials/ribbonMaterial.js";

export const buildRibbons = ({ meta, values, clampLow, clampHigh, settings }) => {
  const rows = meta.rows;
  const cols = meta.cols;
  const range = Math.max(clampHigh - clampLow, 1e-6);

  const extent = meta.extent_meters;
  const dxMeters = meta.dx ?? (extent.xmax - extent.xmin) / cols;
  const dyMeters = meta.dy ?? (extent.ymax - extent.ymin) / rows;

  const trimRows = Math.min(settings.trim.rows, Math.floor((rows - 1) / 2));
  const trimCols = Math.min(settings.trim.cols, Math.floor((cols - 1) / 2));
  const rowStart = trimRows;
  const rowEnd = rows - trimRows;
  const colStart = trimCols;
  const colEnd = cols - trimCols;
  const rowStep = Math.max(1, settings.ribbon.rowStep);
  const colStep = Math.max(1, settings.ribbon.colStep);

  const rowIndices = [];
  for (let i = rowStart; i < rowEnd; i += rowStep) rowIndices.push(i);

  const colIndices = [];
  for (let j = colStart; j < colEnd; j += colStep) colIndices.push(j);

  const usedRows = rowIndices.length;
  const usedCols = colIndices.length;

  if (usedRows <= 0 || usedCols <= 0) {
    throw new Error("Trim settings remove all rows or columns.");
  }

  const dx = dxMeters * settings.metersToUnits;
  const dy = dyMeters * settings.metersToUnits * settings.depthScale;
  const dxStep = dx * colStep;
  const dyStep = dy * rowStep * settings.ribbon.rowGap;

  const width = (usedCols - 1) * dxStep;
  const depth = (usedRows - 1) * dyStep;

  const xOffset = -width / 2;
  const yOffset = -depth / 2;

  const zScale = width * settings.zScaleFactor;

  let heightMaterial = null;
  if (settings.colorMode === "height") {
    heightMaterial = createHeightMaterial({
      zMin: 0,
      zMax: zScale,
      colorLow: settings.heightGradient.low,
      colorHigh: settings.heightGradient.high,
      opacity: settings.ribbon.opacity,
    });
  }

  const group = new THREE.Group();
  const vertexCount = usedCols * 2;
  const indexCount = (usedCols - 1) * 6;
  const useUint32 = vertexCount > 65535;

  const strokePoints = [];

  for (let r = 0; r < usedRows; r++) {
    const positions = new Float32Array(vertexCount * 3);
    const indices = useUint32 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    const strokePositions = new Float32Array(usedCols * 3);

    const dataRowIndex = rowIndices[r];
    const tRow = usedRows > 1 ? r / (usedRows - 1) : 0;
    const rowColor = sampleGradient(tRow, settings.rowGradient);

    const yIndex = meta.rowOrder === "north_to_south" ? usedRows - 1 - r : r;
    const y = yOffset + yIndex * dyStep;

    for (let c = 0; c < usedCols; c++) {
      const dataColIndex = colIndices[c];
      const idx = dataRowIndex * cols + dataColIndex;
      const raw = values[idx];
      const clamped = clamp(raw, clampLow, clampHigh);
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
      positions[baseIndex * 3 + 2] = settings.ribbon.baseHeight;

      const s3 = c * 3;
      strokePositions[s3 + 0] = x;
      strokePositions[s3 + 1] = y;
      strokePositions[s3 + 2] = z + settings.stroke.zOffset;
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
    if (settings.visual.useLambert) geometry.computeVertexNormals();

    const material = heightMaterial ?? createRibbonMaterial({ settings, color: rowColor });

    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.renderOrder = r;
    group.add(ribbon);

    strokePoints.push(strokePositions);
  }

  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 1);

  return {
    group,
    bounds: { box, size, center, maxDim },
    strokePoints,
    layout: {
      dxStep,
      dyStep,
      usedRows,
      usedCols,
      xOffset,
      yOffset,
      zScale,
    },
  };
};

import { buildColorStops, mapValueToRgba } from "./colorMapping";

export type RasterMesh = {
  positionsDegrees: Float64Array;
  colors: Uint8Array;
  indices: Uint32Array;
  rows: number;
  cols: number;
  vertexCount?: number;
  tiles?: RasterMeshTile[];
};

export type RasterMeshTile = {
  positionsDegrees: Float64Array;
  colors: Uint8Array;
  indices: Uint32Array;
  rows: number;
  cols: number;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  vertexCount?: number;
};

type RasterMeshOptions = {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array | Float64Array;
  mask?: Uint8Array;
  min: number;
  max: number;
  colors: string[];
  wrapSeam?: boolean;
  opacity?: number;
  smoothValues?: boolean;
  sampleStep?: number;
  flatShading?: boolean;
  useTiling?: boolean;
};

const MAX_VERTS_PER_TILE = 32000;

const createValueArray = (
  values: Float32Array | Float64Array,
  length: number,
) =>
  values instanceof Float64Array
    ? new Float64Array(length)
    : new Float32Array(length);

export const shouldTileMesh = (rows: number, cols: number): boolean => {
  return rows * cols > MAX_VERTS_PER_TILE;
};

const shouldWrapSeam = (lon: Float64Array) => {
  if (!lon.length) return false;
  const range = lon[lon.length - 1] - lon[0];
  return range > 300;
};

const ensureAscendingGrid = (
  lat: Float64Array,
  lon: Float64Array,
  values: Float32Array | Float64Array,
  mask?: Uint8Array,
) => {
  let latValues = lat;
  let lonValues = lon;
  let data = values;
  let maskData = mask;

  const rows = lat.length;
  const cols = lon.length;

  if (rows && lat[0] > lat[rows - 1]) {
    const flipped = new Float64Array(lat).reverse();
    const next = createValueArray(values, rows * cols);
    const nextMask = mask ? new Uint8Array(rows * cols) : undefined;
    for (let r = 0; r < rows; r += 1) {
      const srcRow = rows - 1 - r;
      next.set(values.subarray(srcRow * cols, srcRow * cols + cols), r * cols);
      if (nextMask && mask) {
        nextMask.set(
          mask.subarray(srcRow * cols, srcRow * cols + cols),
          r * cols,
        );
      }
    }
    latValues = flipped;
    data = next;
    maskData = nextMask;
  }

  if (cols && lon[0] > lon[cols - 1]) {
    const flipped = new Float64Array(lon).reverse();
    const next = createValueArray(values, rows * cols);
    const nextMask = maskData ? new Uint8Array(rows * cols) : undefined;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const src = r * cols + (cols - 1 - c);
        const dest = r * cols + c;
        next[dest] = data[src];
        if (nextMask && maskData) {
          nextMask[dest] = maskData[src];
        }
      }
    }
    lonValues = flipped;
    data = next;
    maskData = nextMask;
  }

  return { lat: latValues, lon: lonValues, values: data, mask: maskData };
};

const expandForSeam = (
  lat: Float64Array,
  lon: Float64Array,
  values: Float32Array | Float64Array,
  mask?: Uint8Array,
) => {
  const rows = lat.length;
  const cols = lon.length;
  const newCols = cols + 1;
  const expandedLon = new Float64Array(newCols);
  expandedLon.set(lon);
  expandedLon[newCols - 1] = lon[0] + 360;

  const expandedValues = createValueArray(values, rows * newCols);
  const expandedMask = mask ? new Uint8Array(rows * newCols) : undefined;

  for (let r = 0; r < rows; r += 1) {
    const rowStart = r * cols;
    const outStart = r * newCols;
    expandedValues.set(values.subarray(rowStart, rowStart + cols), outStart);
    expandedValues[outStart + newCols - 1] = values[rowStart];
    if (expandedMask && mask) {
      expandedMask.set(mask.subarray(rowStart, rowStart + cols), outStart);
      expandedMask[outStart + newCols - 1] = mask[rowStart];
    }
  }

  return {
    lat,
    lon: expandedLon,
    values: expandedValues,
    mask: expandedMask,
    rows,
    cols: newCols,
  };
};

const smoothRasterValues = (
  values: Float32Array | Float64Array,
  rows: number,
  cols: number,
  mask?: Uint8Array,
) => {
  if (!rows || !cols) {
    return values;
  }

  const output = createValueArray(values, values.length);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      if (mask && mask[idx] === 0) {
        output[idx] = values[idx];
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        const rr = r + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dc = -1; dc <= 1; dc += 1) {
          const cc = c + dc;
          if (cc < 0 || cc >= cols) continue;
          const nIdx = rr * cols + cc;
          if (mask && mask[nIdx] === 0) continue;
          const value = values[nIdx];
          if (!Number.isFinite(value)) continue;
          sum += value;
          count += 1;
        }
      }
      output[idx] = count ? sum / count : values[idx];
    }
  }
  return output;
};

const applyBlockAverage = (
  values: Float32Array | Float64Array,
  rows: number,
  cols: number,
  mask: Uint8Array | undefined,
  step: number,
) => {
  if (step <= 1) {
    return { values, mask };
  }

  const averaged = createValueArray(values, values.length);
  const averagedMask = mask ? new Uint8Array(values.length) : undefined;

  for (let rowStart = 0; rowStart < rows; rowStart += step) {
    const rowEnd = Math.min(rowStart + step, rows);
    for (let colStart = 0; colStart < cols; colStart += step) {
      const colEnd = Math.min(colStart + step, cols);
      let sum = 0;
      let count = 0;

      for (let r = rowStart; r < rowEnd; r += 1) {
        for (let c = colStart; c < colEnd; c += 1) {
          const idx = r * cols + c;
          if (mask && mask[idx] === 0) continue;
          const value = values[idx];
          if (!Number.isFinite(value)) continue;
          sum += value;
          count += 1;
        }
      }

      const avg = count > 0 ? sum / count : 0;
      const maskValue = count > 0 ? 1 : 0;

      for (let r = rowStart; r < rowEnd; r += 1) {
        for (let c = colStart; c < colEnd; c += 1) {
          const idx = r * cols + c;
          averaged[idx] = avg;
          if (averagedMask) {
            averagedMask[idx] = maskValue;
          }
        }
      }
    }
  }

  return { values: averaged, mask: averagedMask };
};

const computeCellAverage = (
  values: Float32Array | Float64Array,
  mask: Uint8Array | undefined,
  indices: number[],
) => {
  let sum = 0;
  let count = 0;
  for (const idx of indices) {
    if (mask && mask[idx] === 0) continue;
    const value = values[idx];
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  if (!count) return null;
  return sum / count;
};

const prepareRasterMesh = (options: RasterMeshOptions) => {
  const {
    lat,
    lon,
    values,
    mask,
    wrapSeam = true,
    smoothValues = false,
    sampleStep = 1,
    flatShading = false,
  } = options;

  const normalized = ensureAscendingGrid(lat, lon, values, mask);
  const smoothedValues = smoothValues
    ? smoothRasterValues(
        normalized.values,
        normalized.lat.length,
        normalized.lon.length,
        normalized.mask,
      )
    : normalized.values;
  const averaged = flatShading
    ? applyBlockAverage(
        smoothedValues,
        normalized.lat.length,
        normalized.lon.length,
        normalized.mask,
        Math.max(1, Math.round(sampleStep)),
      )
    : { values: smoothedValues, mask: normalized.mask };

  return wrapSeam && shouldWrapSeam(normalized.lon)
    ? expandForSeam(
        normalized.lat,
        normalized.lon,
        averaged.values,
        averaged.mask,
      )
    : {
        lat: normalized.lat,
        lon: normalized.lon,
        values: averaged.values,
        mask: averaged.mask,
        rows: normalized.lat.length,
        cols: normalized.lon.length,
      };
};

const buildSingleMesh = (
  prepared: {
    lat: Float64Array;
    lon: Float64Array;
    values: Float32Array | Float64Array;
    mask?: Uint8Array;
    rows: number;
    cols: number;
  },
  min: number,
  max: number,
  colors: string[],
  opacity: number,
  flatShading: boolean,
): RasterMesh => {
  const rows = prepared.rows;
  const cols = prepared.cols;
  const totalVerts = rows * cols;

  const positionsDegrees = new Float64Array(totalVerts * 2);
  const colorsOut = new Uint8Array(totalVerts * 4);
  const stops = buildColorStops(colors);

  if (flatShading) {
    const cellRows = rows - 1;
    const cellCols = cols - 1;
    const cellCount = Math.max(0, cellRows * cellCols);
    const flatPositions = new Float64Array(cellCount * 4 * 2);
    const flatColors = new Uint8Array(cellCount * 4 * 4);
    const flatIndices = new Uint32Array(cellCount * 6);
    let vOffset = 0;
    let iOffset = 0;

    for (let r = 0; r < cellRows; r += 1) {
      const latTop = prepared.lat[r];
      const latBottom = prepared.lat[r + 1];
      for (let c = 0; c < cellCols; c += 1) {
        const lonLeft = prepared.lon[c];
        const lonRight = prepared.lon[c + 1];
        const i0 = r * cols + c;
        const i1 = i0 + 1;
        const i2 = i0 + cols;
        const i3 = i2 + 1;
        const avg = computeCellAverage(prepared.values, prepared.mask, [
          i0,
          i1,
          i2,
          i3,
        ]);

        const rgba =
          avg === null ? [0, 0, 0, 0] : mapValueToRgba(avg, min, max, stops);
        rgba[3] = Math.round(rgba[3] * opacity);

        const base = vOffset * 4;
        flatPositions[base * 2] = lonLeft;
        flatPositions[base * 2 + 1] = latTop;
        flatPositions[(base + 1) * 2] = lonRight;
        flatPositions[(base + 1) * 2 + 1] = latTop;
        flatPositions[(base + 2) * 2] = lonLeft;
        flatPositions[(base + 2) * 2 + 1] = latBottom;
        flatPositions[(base + 3) * 2] = lonRight;
        flatPositions[(base + 3) * 2 + 1] = latBottom;

        for (let v = 0; v < 4; v += 1) {
          flatColors.set(rgba, (base + v) * 4);
        }

        flatIndices[iOffset++] = base;
        flatIndices[iOffset++] = base + 2;
        flatIndices[iOffset++] = base + 1;
        flatIndices[iOffset++] = base + 1;
        flatIndices[iOffset++] = base + 2;
        flatIndices[iOffset++] = base + 3;

        vOffset += 1;
      }
    }

    return {
      positionsDegrees: flatPositions,
      colors: flatColors,
      indices: flatIndices,
      rows,
      cols,
      vertexCount: cellCount * 4,
    };
  }

  for (let r = 0; r < rows; r += 1) {
    const latValue = prepared.lat[r];
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      const lonValue = prepared.lon[c];
      positionsDegrees[idx * 2] = lonValue;
      positionsDegrees[idx * 2 + 1] = latValue;

      if (prepared.mask && prepared.mask[idx] === 0) {
        colorsOut.set([0, 0, 0, 0], idx * 4);
        continue;
      }

      const value = prepared.values[idx];
      const rgba = mapValueToRgba(value, min, max, stops);
      rgba[3] = Math.round(rgba[3] * opacity);
      colorsOut.set(rgba, idx * 4);
    }
  }

  const quadCount = (rows - 1) * (cols - 1);
  const indices = new Uint32Array(quadCount * 6);
  let offset = 0;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const i0 = r * cols + c;
      const i1 = i0 + 1;
      const i2 = i0 + cols;
      const i3 = i2 + 1;
      indices[offset++] = i0;
      indices[offset++] = i2;
      indices[offset++] = i1;
      indices[offset++] = i1;
      indices[offset++] = i2;
      indices[offset++] = i3;
    }
  }

  return {
    positionsDegrees,
    colors: colorsOut,
    indices,
    rows,
    cols,
  };
};

const buildFlatMeshTiles = (
  prepared: {
    lat: Float64Array;
    lon: Float64Array;
    values: Float32Array | Float64Array;
    mask?: Uint8Array;
    rows: number;
    cols: number;
  },
  min: number,
  max: number,
  colors: string[],
  opacity: number,
): RasterMesh => {
  const rows = prepared.rows;
  const cols = prepared.cols;
  const vertsPerRow = cols;
  let maxRowsPerTile = Math.max(
    2,
    Math.floor(MAX_VERTS_PER_TILE / vertsPerRow),
  );
  let maxColsPerTile = Math.min(cols, MAX_VERTS_PER_TILE);

  if (rows > maxRowsPerTile && maxRowsPerTile > 2) {
    maxRowsPerTile -= 1;
  }
  if (cols > maxColsPerTile && maxColsPerTile > 2) {
    maxColsPerTile -= 1;
  }

  const numRowTiles = Math.ceil(rows / maxRowsPerTile);
  const numColTiles = Math.ceil(cols / maxColsPerTile);
  const rowOverlap = numRowTiles > 1 ? 1 : 0;
  const colOverlap = numColTiles > 1 ? 1 : 0;
  const tiles: RasterMeshTile[] = [];
  const stops = buildColorStops(colors);

  for (let tileRow = 0; tileRow < numRowTiles; tileRow += 1) {
    for (let tileCol = 0; tileCol < numColTiles; tileCol += 1) {
      const rowStart = tileRow * maxRowsPerTile;
      const baseRowEnd = rowStart + maxRowsPerTile;
      const rowEnd =
        tileRow < numRowTiles - 1
          ? Math.min(baseRowEnd + rowOverlap, rows)
          : Math.min(baseRowEnd, rows);
      const colStart = tileCol * maxColsPerTile;
      const baseColEnd = colStart + maxColsPerTile;
      const colEnd =
        tileCol < numColTiles - 1
          ? Math.min(baseColEnd + colOverlap, cols)
          : Math.min(baseColEnd, cols);

      const tileRows = rowEnd - rowStart;
      const tileCols = colEnd - colStart;
      const cellRows = Math.max(0, tileRows - 1);
      const cellCols = Math.max(0, tileCols - 1);
      const cellCount = cellRows * cellCols;

      const tilePositions = new Float64Array(cellCount * 4 * 2);
      const tileColors = new Uint8Array(cellCount * 4 * 4);
      const tileIndices = new Uint32Array(cellCount * 6);
      let vOffset = 0;
      let iOffset = 0;

      for (let r = rowStart; r < rowEnd - 1; r += 1) {
        const latTop = prepared.lat[r];
        const latBottom = prepared.lat[r + 1];
        for (let c = colStart; c < colEnd - 1; c += 1) {
          const lonLeft = prepared.lon[c];
          const lonRight = prepared.lon[c + 1];
          const i0 = r * cols + c;
          const i1 = i0 + 1;
          const i2 = i0 + cols;
          const i3 = i2 + 1;
          const avg = computeCellAverage(prepared.values, prepared.mask, [
            i0,
            i1,
            i2,
            i3,
          ]);

          const rgba =
            avg === null ? [0, 0, 0, 0] : mapValueToRgba(avg, min, max, stops);
          rgba[3] = Math.round(rgba[3] * opacity);

          const base = vOffset * 4;
          tilePositions[base * 2] = lonLeft;
          tilePositions[base * 2 + 1] = latTop;
          tilePositions[(base + 1) * 2] = lonRight;
          tilePositions[(base + 1) * 2 + 1] = latTop;
          tilePositions[(base + 2) * 2] = lonLeft;
          tilePositions[(base + 2) * 2 + 1] = latBottom;
          tilePositions[(base + 3) * 2] = lonRight;
          tilePositions[(base + 3) * 2 + 1] = latBottom;

          for (let v = 0; v < 4; v += 1) {
            tileColors.set(rgba, (base + v) * 4);
          }

          tileIndices[iOffset++] = base;
          tileIndices[iOffset++] = base + 2;
          tileIndices[iOffset++] = base + 1;
          tileIndices[iOffset++] = base + 1;
          tileIndices[iOffset++] = base + 2;
          tileIndices[iOffset++] = base + 3;

          vOffset += 1;
        }
      }

      tiles.push({
        positionsDegrees: tilePositions,
        colors: tileColors,
        indices: tileIndices,
        rows: tileRows,
        cols: tileCols,
        rowStart,
        rowEnd,
        colStart,
        colEnd,
        vertexCount: cellCount * 4,
      });
    }
  }

  return {
    positionsDegrees: new Float64Array(0),
    colors: new Uint8Array(0),
    indices: new Uint32Array(0),
    rows,
    cols,
    tiles,
  };
};

export const buildRasterMeshTiles = (
  options: RasterMeshOptions,
): RasterMesh => {
  const { min, max, colors, opacity = 1, flatShading = false } = options;
  const prepared = prepareRasterMesh(options);
  const rows = prepared.rows;
  const cols = prepared.cols;
  const totalVerts = rows * cols;

  if (!shouldTileMesh(rows, cols)) {
    return buildSingleMesh(prepared, min, max, colors, opacity, flatShading);
  }

  if (flatShading) {
    return buildFlatMeshTiles(prepared, min, max, colors, opacity);
  }

  const vertsPerRow = cols;
  let maxRowsPerTile = Math.max(
    2,
    Math.floor(MAX_VERTS_PER_TILE / vertsPerRow),
  );
  let maxColsPerTile = Math.min(cols, MAX_VERTS_PER_TILE);

  if (rows > maxRowsPerTile && maxRowsPerTile > 2) {
    maxRowsPerTile -= 1;
  }
  if (cols > maxColsPerTile && maxColsPerTile > 2) {
    maxColsPerTile -= 1;
  }

  const numRowTiles = Math.ceil(rows / maxRowsPerTile);
  const numColTiles = Math.ceil(cols / maxColsPerTile);
  const rowOverlap = numRowTiles > 1 ? 1 : 0;
  const colOverlap = numColTiles > 1 ? 1 : 0;

  const tiles: RasterMeshTile[] = [];
  const stops = buildColorStops(colors);

  for (let tileRow = 0; tileRow < numRowTiles; tileRow += 1) {
    for (let tileCol = 0; tileCol < numColTiles; tileCol += 1) {
      const rowStart = tileRow * maxRowsPerTile;
      const baseRowEnd = rowStart + maxRowsPerTile;
      const rowEnd =
        tileRow < numRowTiles - 1
          ? Math.min(baseRowEnd + rowOverlap, rows)
          : Math.min(baseRowEnd, rows);
      const colStart = tileCol * maxColsPerTile;
      const baseColEnd = colStart + maxColsPerTile;
      const colEnd =
        tileCol < numColTiles - 1
          ? Math.min(baseColEnd + colOverlap, cols)
          : Math.min(baseColEnd, cols);

      const tileRows = rowEnd - rowStart;
      const tileCols = colEnd - colStart;
      const tileVerts = tileRows * tileCols;

      const tilePositions = new Float64Array(tileVerts * 2);
      const tileColors = new Uint8Array(tileVerts * 4);

      let tileIdx = 0;
      for (let r = rowStart; r < rowEnd; r += 1) {
        const latValue = prepared.lat[r];
        for (let c = colStart; c < colEnd; c += 1) {
          const lonValue = prepared.lon[c];
          const origIdx = r * cols + c;

          tilePositions[tileIdx * 2] = lonValue;
          tilePositions[tileIdx * 2 + 1] = latValue;

          if (prepared.mask && prepared.mask[origIdx] === 0) {
            tileColors.set([0, 0, 0, 0], tileIdx * 4);
          } else {
            const value = prepared.values[origIdx];
            const rgba = mapValueToRgba(value, min, max, stops);
            rgba[3] = Math.round(rgba[3] * opacity);
            tileColors.set(rgba, tileIdx * 4);
          }

          tileIdx += 1;
        }
      }

      const tileQuadCount = (tileRows - 1) * (tileCols - 1);
      const tileIndices = new Uint32Array(tileQuadCount * 6);
      let offset = 0;
      for (let r = 0; r < tileRows - 1; r += 1) {
        for (let c = 0; c < tileCols - 1; c += 1) {
          const i0 = r * tileCols + c;
          const i1 = i0 + 1;
          const i2 = i0 + tileCols;
          const i3 = i2 + 1;
          tileIndices[offset++] = i0;
          tileIndices[offset++] = i2;
          tileIndices[offset++] = i1;
          tileIndices[offset++] = i1;
          tileIndices[offset++] = i2;
          tileIndices[offset++] = i3;
        }
      }

      tiles.push({
        positionsDegrees: tilePositions,
        colors: tileColors,
        indices: tileIndices,
        rows: tileRows,
        cols: tileCols,
        rowStart,
        rowEnd,
        colStart,
        colEnd,
      });
    }
  }

  return {
    positionsDegrees: new Float64Array(0),
    colors: new Uint8Array(0),
    indices: new Uint32Array(0),
    rows,
    cols,
    tiles,
  };
};

export const buildRasterMesh = (options: RasterMeshOptions): RasterMesh => {
  const {
    lat,
    lon,
    values,
    min,
    max,
    colors,
    opacity = 1,
    useTiling,
    flatShading = false,
  } = options;

  if (!lat.length || !lon.length || !values.length) {
    return {
      positionsDegrees: new Float64Array(),
      colors: new Uint8Array(),
      indices: new Uint32Array(),
      rows: 0,
      cols: 0,
    };
  }

  if (useTiling) {
    return buildRasterMeshTiles(options);
  }

  const prepared = prepareRasterMesh(options);
  return buildSingleMesh(prepared, min, max, colors, opacity, flatShading);
};

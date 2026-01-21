import { buildColorStops, mapValueToRgba } from "./colorMapping";

export type RasterMesh = {
  positionsDegrees: Float64Array;
  colors: Uint8Array;
  indices: Uint32Array;
  rows: number;
  cols: number;
};

type RasterMeshOptions = {
  lat: Float64Array;
  lon: Float64Array;
  values: Float32Array;
  mask?: Uint8Array;
  min: number;
  max: number;
  colors: string[];
  wrapSeam?: boolean;
  opacity?: number;
  smoothValues?: boolean;
};

const shouldWrapSeam = (lon: Float64Array) => {
  if (!lon.length) return false;
  const range = lon[lon.length - 1] - lon[0];
  return range > 300;
};

const ensureAscendingGrid = (
  lat: Float64Array,
  lon: Float64Array,
  values: Float32Array,
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
    const next = new Float32Array(rows * cols);
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
    const next = new Float32Array(rows * cols);
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
  values: Float32Array,
  mask?: Uint8Array,
) => {
  const rows = lat.length;
  const cols = lon.length;
  const newCols = cols + 1;
  const expandedLon = new Float64Array(newCols);
  expandedLon.set(lon);
  expandedLon[newCols - 1] = lon[0] + 360;

  const expandedValues = new Float32Array(rows * newCols);
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
  values: Float32Array,
  rows: number,
  cols: number,
  mask?: Uint8Array,
) => {
  if (!rows || !cols) {
    return values;
  }

  const output = new Float32Array(values.length);
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

export const buildRasterMesh = (options: RasterMeshOptions): RasterMesh => {
  const {
    lat,
    lon,
    values,
    mask,
    min,
    max,
    colors,
    wrapSeam = true,
    opacity = 1,
    smoothValues = false,
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

  const normalized = ensureAscendingGrid(lat, lon, values, mask);
  const smoothedValues = smoothValues
    ? smoothRasterValues(
        normalized.values,
        normalized.lat.length,
        normalized.lon.length,
        normalized.mask,
      )
    : normalized.values;
  const prepared =
    wrapSeam && shouldWrapSeam(normalized.lon)
      ? expandForSeam(
          normalized.lat,
          normalized.lon,
          smoothedValues,
          normalized.mask,
        )
      : {
          lat: normalized.lat,
          lon: normalized.lon,
          values: smoothedValues,
          mask: normalized.mask,
          rows: normalized.lat.length,
          cols: normalized.lon.length,
        };

  const rows = prepared.rows;
  const cols = prepared.cols;
  const totalVerts = rows * cols;

  const positionsDegrees = new Float64Array(totalVerts * 2);
  const colorsOut = new Uint8Array(totalVerts * 4);
  const stops = buildColorStops(colors);

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
